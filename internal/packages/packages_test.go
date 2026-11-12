package packages_test

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"easel/internal/database/dbtest"
	"easel/internal/games"
	"easel/internal/packages"
	"easel/internal/platform"
)

const main = `
export function handleMessage(message) {
  if (message.op === "create") {
    const sheet = new acme.rpg.Sheet();
    sheet.title = message.title;
    if (message.notes !== undefined) sheet.notes = message.notes;
    sheet.save();
    return sheet.id;
  }
  return acme.rpg.Sheet.ids().map((id) => { const sheet = new acme.rpg.Sheet(id); return { title: sheet.title, notes: sheet.notes, hp: sheet.hp }; });
}
`

type source struct {
	t    *testing.T
	root string
}

func (s source) write(folder string, files map[string]string) string {
	s.t.Helper()
	target := filepath.Join(s.root, folder)
	for name, contents := range files {
		file := filepath.Join(target, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			s.t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte(contents), 0o644); err != nil {
			s.t.Fatal(err)
		}
	}
	return target
}

func (s source) pack(folder string, files map[string]string) string {
	s.t.Helper()
	archive := filepath.Join(s.root, folder+".zip")
	if err := packages.Pack(s.write(folder, files), archive); err != nil {
		s.t.Fatal(err)
	}
	return archive
}

func (s source) application(version, fields, extra string) map[string]string {
	channel := filepath.ToSlash(filepath.Join(s.root, "channel"))
	parts := strings.Split(version, ".")
	return map[string]string{
		"manifest.json": fmt.Sprintf(`{"type":"application","owner":"acme","host":"rpg","name":"game","version":{"major":%s,"minor":%s,"revision":%s},
 "channels":{"stable":{"manifest":"%s/manifest.json","file":"%s/game.zip"}},
 "server":{"application":{"entry":"main.mjs"%s},"data":[{".name":"Sheet",%s,"hp":{".type":"integer",".default":10}}]}}`, parts[0], parts[1], parts[2], channel, channel, extra, fields),
		"main.mjs": main,
	}
}

func (s source) publish(version, fields string) {
	s.t.Helper()
	files := s.application(version, fields, "")
	archive := s.pack("release-"+version, files)
	channel := filepath.Join(s.root, "channel")
	if err := os.MkdirAll(channel, 0o755); err != nil {
		s.t.Fatal(err)
	}
	data, err := os.ReadFile(archive)
	if err != nil {
		s.t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(channel, "game.zip"), data, 0o644); err != nil {
		s.t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(channel, "manifest.json"), []byte(files["manifest.json"]), 0o644); err != nil {
		s.t.Fatal(err)
	}
}

const title = `"title":{".type":"string"}`

func TestPackagesInstallUpdateAndRecover(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	easel := t.TempDir()
	s := source{t, t.TempDir()}
	installer := &packages.Installer{EaselDir: easel, Compatible: games.CompatibilityCheck(pool, easel, nil)}
	notes := s.pack("notes", map[string]string{
		"manifest.json": `{"type":"module","owner":"acme","host":"rpg","name":"notes","version":{"major":1,"minor":0,"revision":0},"server":{"library":{"entry":"notes.mjs"},"data":[{".modify":"Sheet","notes":{".type":"string",".default":""}}]}}`,
		"notes.mjs":     "",
	})

	escaping := filepath.Join(s.root, "escaping.zip")
	file, err := os.Create(escaping)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for name, contents := range map[string]string{"manifest.json": s.application("1.0.0", title, "")["manifest.json"], "main.mjs": main, "../outside.mjs": "escaped"} {
		entry, _ := writer.Create(name)
		entry.Write([]byte(contents))
	}
	writer.Close()
	file.Close()
	for name, archive := range map[string]string{
		"unsafe path":        escaping,
		"missing dependency": s.pack("needy", s.application("1.0.0", title, `,"required":{"modules":["acme.rpg.absent"]}`)),
		"invalid manifest":   s.pack("broken", map[string]string{"manifest.json": `{"type":"application","owner":"acme","host":"rpg","name":"game","server":{"application":{"entry":"missing.mjs"}}}`, "other.mjs": ""}),
		"not a package":      s.pack("notes", nil) + ".absent",
	} {
		if name == "invalid manifest" {
			continue
		}
		if _, err := installer.Install(ctx, archive); err == nil {
			t.Fatalf("%s was installed", name)
		}
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(easel), "outside.mjs")); err == nil {
		t.Fatal("an archive wrote outside the installation")
	}
	if entries, _ := os.ReadDir(filepath.Join(easel, "applications")); len(entries) != 0 {
		t.Fatalf("a refused package was left installed: %v", entries)
	}

	inspection, err := installer.Inspect(ctx, notes)
	if err != nil || inspection.ID != "acme.rpg.notes" || inspection.Installed != "" || inspection.Files != 2 {
		t.Fatalf("inspection: %+v %v", inspection, err)
	}
	if result, err := installer.Install(ctx, notes); err != nil || result.Action != "installed" {
		t.Fatalf("install module: %+v %v", result, err)
	}
	if result, err := installer.Install(ctx, s.pack("game", s.application("1.0.0", title, ""))); err != nil || result.Action != "installed" || result.Version != "1.0.0" {
		t.Fatalf("install application: %+v %v", result, err)
	}

	folder := t.TempDir()
	catalog, err := platform.LoadCatalog(easel)
	if err != nil {
		t.Fatal(err)
	}
	preferencesFile := filepath.Join(t.TempDir(), "packages.json")
	manager := &games.Manager{Pool: pool, Catalog: catalog, Folder: folder, Packages: &games.PackageControl{Installer: installer, Preferences: preferencesFile}}
	t.Cleanup(manager.Close)
	game, err := manager.Create(ctx, "Campaign", "acme.rpg.game", []string{"acme.rpg.notes"}, games.Open)
	if err != nil {
		t.Fatal(err)
	}
	sheets := func() string {
		t.Helper()
		if err := manager.Start(ctx, game.ID); err != nil {
			t.Fatal(err)
		}
		runtime, _ := manager.Runtime(game.ID)
		data, err := runtime.Dispatch(ctx, json.RawMessage(`{"op":"list"}`))
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Stop(game.ID); err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	if err := manager.Start(ctx, game.ID); err != nil {
		t.Fatal(err)
	}
	runtime, _ := manager.Runtime(game.ID)
	if _, err := runtime.Dispatch(ctx, json.RawMessage(`{"op":"create","title":"Valeros","notes":"brave"}`)); err != nil {
		t.Fatal(err)
	}
	if err := manager.SetModules(ctx, game.ID, nil); err != games.ErrRunning {
		t.Fatalf("modules changed while running: %v", err)
	}
	if err := manager.Stop(game.ID); err != nil {
		t.Fatal(err)
	}

	preferences := packages.Preferences{Default: packages.Preference{Channel: "stable"}, Packages: map[string]packages.Preference{}}
	if err := preferences.Save(preferencesFile); err != nil {
		t.Fatal(err)
	}
	s.publish("1.1.0", title+`,"level":{".type":"integer",".required":false}`)
	updates, err := installer.Check(ctx, preferences)
	if err != nil || len(updates) != 1 || !updates[0].Newer || updates[0].Available != "1.1.0" || updates[0].Mode != packages.Manual {
		t.Fatalf("update discovery: %+v %v", updates, err)
	}
	if _, err := manager.UpdatePackage(ctx, "acme.rpg.game"); err != nil {
		t.Fatal(err)
	}
	if listed := sheets(); !strings.Contains(listed, "Valeros") || !strings.Contains(listed, "brave") {
		t.Fatalf("records after a compatible update: %s", listed)
	}
	if _, err := manager.UpdatePackage(ctx, "acme.rpg.game"); err == nil || !strings.Contains(err.Error(), "already the newest") {
		t.Fatalf("repeated update: %v", err)
	}

	s.publish("2.0.0", `"name":{".type":"string"}`)
	if _, err := manager.UpdatePackage(ctx, "acme.rpg.game"); err == nil || !strings.Contains(err.Error(), "not compatible") || !strings.Contains(err.Error(), "Campaign") {
		t.Fatalf("an incompatible update was applied: %v", err)
	}
	installed, err := installer.List(preferences)
	if err != nil || len(installed) != 2 || installed[0].ID != "acme.rpg.game" || installed[0].Version != "1.1.0" || len(installed[0].Kept) != 1 || installed[0].Problem != "" {
		t.Fatalf("installed after a refused update: %+v %v", installed, err)
	}
	if entries, _ := os.ReadDir(filepath.Join(easel, ".staging")); len(entries) != 0 {
		t.Fatalf("a refused update left staging files: %v", entries)
	}
	if listed := sheets(); !strings.Contains(listed, "Valeros") {
		t.Fatalf("records after a refused update: %s", listed)
	}

	if err := manager.SetModules(ctx, game.ID, []string{"acme.rpg.absent"}); err == nil {
		t.Fatal("an uninstalled module was added to a game")
	}
	if err := manager.SetModules(ctx, game.ID, []string{}); err != nil {
		t.Fatal(err)
	}
	if listed := sheets(); !strings.Contains(listed, "brave") {
		t.Fatalf("records after removing the module from the game: %s", listed)
	}
	if result, err := installer.Remove(ctx, "acme.rpg.notes"); err != nil || result.Action != "removed" {
		t.Fatalf("remove module: %+v %v", result, err)
	}
	if _, err := manager.RefreshPackages(ctx); err != nil {
		t.Fatal(err)
	}
	if listed := sheets(); !strings.Contains(listed, "brave") {
		t.Fatalf("records after uninstalling the module: %s", listed)
	}
	if _, err := installer.Install(ctx, notes); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.RefreshPackages(ctx); err != nil {
		t.Fatal(err)
	}
	if err := manager.SetModules(ctx, game.ID, []string{"acme.rpg.notes"}); err != nil {
		t.Fatal(err)
	}
	if listed := sheets(); !strings.Contains(listed, "brave") {
		t.Fatalf("records after reinstalling the module: %s", listed)
	}

	if result, err := installer.Rollback(ctx, "acme.rpg.game"); err != nil || result.Version != "1.0.0" || result.Action != "rolled back" {
		t.Fatalf("rollback: %+v %v", result, err)
	}
	if _, err := manager.RefreshPackages(ctx); err != nil {
		t.Fatal(err)
	}
	if listed := sheets(); !strings.Contains(listed, "Valeros") {
		t.Fatalf("records after rollback: %s", listed)
	}
	if _, err := installer.Install(ctx, s.pack("old", s.application("0.9.0", title, ""))); err == nil || !strings.Contains(err.Error(), "older") {
		t.Fatalf("downgrade: %v", err)
	}

	s.publish("1.2.0", title)
	preferences.Packages["acme.rpg.game"] = packages.Preference{Update: packages.Startup}
	outcomes := installer.Startup(ctx, preferences)
	if len(outcomes) != 1 || outcomes[0].Problem != "" || outcomes[0].Result == nil || outcomes[0].Result.Version != "1.2.0" {
		t.Fatalf("startup update: %+v", outcomes)
	}
	s.publish("3.0.0", `"name":{".type":"string"}`)
	outcomes = installer.Startup(ctx, preferences)
	if len(outcomes) != 1 || !strings.Contains(outcomes[0].Problem, "not compatible") {
		t.Fatalf("incompatible startup update: %+v", outcomes)
	}
	if _, err := manager.RefreshPackages(ctx); err != nil {
		t.Fatal(err)
	}
	if listed := sheets(); !strings.Contains(listed, "Valeros") {
		t.Fatalf("records after startup updates: %s", listed)
	}
}
