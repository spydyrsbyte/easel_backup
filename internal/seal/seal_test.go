package seal_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"easel/internal/manifest"
	"easel/internal/packages"
	"easel/internal/platform"
	"easel/internal/seal"
	"easel/internal/session"
)

const secretRule = "the-dragon-hoard-is-under-the-chapel"

func source(t *testing.T, version string) string {
	t.Helper()
	folder := t.TempDir()
	parts := strings.Split(version, ".")
	files := map[string]string{
		"manifest.json": fmt.Sprintf(`{"type":"application","owner":"acme","host":"saga","name":"game","version":{"major":%s,"minor":%s,"revision":%s},"encrypt":{"public":"keys/publisher.pub"},"server":{"application":{"entry":"server/main.mjs"}}}`, parts[0], parts[1], parts[2]),
		"server/main.mjs": `import { rule } from "./rules.mjs";
export function handleMessage() { return rule; }`,
		"server/rules.mjs": `export const rule = "` + secretRule + `";`,
	}
	for name, contents := range files {
		target := filepath.Join(folder, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(contents), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return folder
}

func play(t *testing.T, easel string) (string, error) {
	t.Helper()
	catalog, err := platform.LoadCatalog(easel)
	if err != nil {
		return "", err
	}
	pkg, installed := catalog.Applications["acme.saga.game"]
	if !installed {
		return "", fmt.Errorf("not in the catalog: %v", catalog.Unlicensed)
	}
	runtime, err := session.NewGame(context.Background(), session.Game{GameID: "game", SessionID: "session", Packages: []manifest.Package{pkg}})
	if err != nil {
		return "", err
	}
	defer runtime.Close()
	data, err := runtime.Dispatch(context.Background(), json.RawMessage(`{}`))
	return string(data), err
}

func TestProtectedPackagesNeedALicenseForThisInstallation(t *testing.T) {
	work := t.TempDir()
	publisher, err := seal.NewPublisher("Acme Games")
	if err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(work, "saga-1.0.0.zip")
	if _, err := publisher.Seal(source(t, "1.0.0"), archive); err != nil {
		t.Fatal(err)
	}
	sealed, err := os.ReadFile(archive)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, []byte(secretRule)) || bytes.Contains(sealed, []byte("rules.mjs")) {
		t.Fatal("the sealed archive shows protected content")
	}

	easel := t.TempDir()
	config := t.TempDir()
	store := &seal.Store{Dir: filepath.Join(config, "licenses"), KeyFile: filepath.Join(config, "installation.key")}
	seal.Configure(store)
	t.Cleanup(func() { seal.Configure(nil) })
	installation, err := store.Installation()
	if err != nil {
		t.Fatal(err)
	}
	installer := &packages.Installer{EaselDir: easel}
	if _, err := installer.Install(context.Background(), archive); !errors.Is(err, seal.ErrNoLicense) || !strings.Contains(err.Error(), installation) {
		t.Fatalf("a protected package installed without a license: %v", err)
	}

	elsewhere := &seal.Store{Dir: filepath.Join(t.TempDir(), "licenses"), KeyFile: filepath.Join(t.TempDir(), "installation.key")}
	otherInstallation, err := elsewhere.Installation()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	issue := func(from seal.Publisher, pkg string, major int, to string, expires time.Time) []byte {
		t.Helper()
		license, err := from.Issue(pkg, major, to, "Riverside Gaming Club", expires, now)
		if err != nil {
			t.Fatal(err)
		}
		data, err := json.Marshal(license)
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	if _, err := store.Install(issue(publisher, "acme.saga.game", 1, otherInstallation, time.Time{})); err == nil || !strings.Contains(err.Error(), "another installation") {
		t.Fatalf("a license for another installation was accepted: %v", err)
	}
	tampered := bytes.Replace(issue(publisher, "acme.saga.game", 1, installation, time.Time{}), []byte("Riverside"), []byte("Lakeside!"), 1)
	if _, err := store.Install(tampered); err == nil || !strings.Contains(err.Error(), "signature") {
		t.Fatalf("an altered license was accepted: %v", err)
	}
	if _, err := store.Install(issue(publisher, "acme.saga.game", 1, installation, now.Add(-time.Hour))); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("an expired license was accepted: %v", err)
	}
	impostor, err := seal.NewPublisher("Impostor")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Install(issue(impostor, "acme.saga.game", 1, installation, time.Time{})); err != nil {
		t.Fatal(err)
	}
	if _, err := installer.Install(context.Background(), archive); err == nil || !strings.Contains(err.Error(), "different publisher") {
		t.Fatalf("another publisher's license opened the package: %v", err)
	}

	license, err := store.Install(issue(publisher, "acme.saga.game", 1, installation, now.Add(time.Hour)))
	if err != nil || license.Licensee != "Riverside Gaming Club" {
		t.Fatalf("install license: %+v %v", license, err)
	}
	result, err := installer.Install(context.Background(), archive)
	if err != nil || result.ID != "acme.saga.game" || result.Version != "1.0.0" {
		t.Fatalf("install protected package: %+v %v", result, err)
	}
	found := 0
	err = filepath.WalkDir(result.Folder, func(current string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		found++
		data, err := os.ReadFile(current)
		if err == nil && bytes.Contains(data, []byte(secretRule)) {
			t.Errorf("%s holds protected content in the clear", current)
		}
		return err
	})
	if err != nil || found != 3 {
		t.Fatalf("installed files: %d %v", found, err)
	}
	if answer, err := play(t, easel); err != nil || answer != `"`+secretRule+`"` {
		t.Fatalf("the licensed package did not run: %s %v", answer, err)
	}
	listed, err := store.List()
	if err != nil || len(listed) != 1 || listed[0].Key != "" || listed[0].Licensee != "Riverside Gaming Club" {
		t.Fatalf("licenses: %+v %v", listed, err)
	}

	update := filepath.Join(work, "saga-1.1.0.zip")
	if _, err := publisher.Seal(source(t, "1.1.0"), update); err != nil {
		t.Fatal(err)
	}
	if result, err := installer.Install(context.Background(), update); err != nil || result.Action != "updated" {
		t.Fatalf("an update in the licensed version line: %+v %v", result, err)
	}
	next := filepath.Join(work, "saga-2.0.0.zip")
	if _, err := publisher.Seal(source(t, "2.0.0"), next); err != nil {
		t.Fatal(err)
	}
	if _, err := installer.Install(context.Background(), next); !errors.Is(err, seal.ErrNoLicense) {
		t.Fatalf("a new version line opened with the old license: %v", err)
	}
	if answer, err := play(t, easel); err != nil || !strings.Contains(answer, secretRule) {
		t.Fatalf("the installed version stopped running after a refused update: %s %v", answer, err)
	}

	seal.Configure(elsewhere)
	if _, err := play(t, easel); err == nil || !strings.Contains(err.Error(), "no license") {
		t.Fatalf("a copied installation folder ran on another installation: %v", err)
	}
	copied, err := os.ReadFile(filepath.Join(store.Dir, "acme.saga.game-1.license"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := elsewhere.Install(copied); err == nil {
		t.Fatal("a copied license was accepted by another installation")
	}
	seal.Configure(&seal.Store{Dir: store.Dir, KeyFile: store.KeyFile, Now: func() time.Time { return now.Add(2 * time.Hour) }})
	if _, err := play(t, easel); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("an expired license kept working: %v", err)
	}

	plain := t.TempDir()
	unsealed := filepath.Join(work, "plain.zip")
	if err := packages.Pack(source(t, "1.0.0"), unsealed); err != nil {
		t.Fatal(err)
	}
	seal.Configure(store)
	if _, err := (&packages.Installer{EaselDir: plain}).Install(context.Background(), unsealed); err != nil {
		t.Fatal(err)
	}
	if _, err := play(t, plain); err == nil || !strings.Contains(err.Error(), "installed unsealed") {
		t.Fatalf("a package that asks for protection ran unsealed: %v", err)
	}
}
