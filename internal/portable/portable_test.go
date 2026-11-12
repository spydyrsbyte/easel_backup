package portable_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"easel/internal/accounts"
	"easel/internal/database"
	"easel/internal/database/dbtest"
	"easel/internal/games"
	"easel/internal/manifest"
	"easel/internal/platform"
	"easel/internal/portable"
	"github.com/jackc/pgx/v5/pgxpool"
)

const schemaPath = "../../server/easel/database/schema.sql"

const sheetMain = `
export function handleMessage(message) {
  if (message.op === "create") {
    const sheet = new acme.rpg.Sheet();
    sheet.owner = message.owner;
    sheet[message.field || "title"] = message.title;
    if (message.notes !== undefined) sheet.notes = message.notes;
    sheet.save();
    Application.files.create({ name: "portrait.txt", mediaType: "text/plain", text: "portrait of " + message.title });
    return sheet.id;
  }
  if (message.op === "files") return Application.files.list().map((file) => Application.files.readText(file.id));
  return acme.rpg.Sheet.ids().map((id) => { const sheet = new acme.rpg.Sheet(id); return { owner: sheet.owner, title: sheet.title, name: sheet.name, notes: sheet.notes, hp: sheet.hp }; });
}
`

func load(t *testing.T, text string, files map[string]string) manifest.Package {
	t.Helper()
	tree := fstest.MapFS{manifest.FileName: {Data: []byte(text)}}
	for name, contents := range files {
		tree[name] = &fstest.MapFile{Data: []byte(contents)}
	}
	pkg, err := manifest.Load(tree)
	if err != nil {
		t.Fatal(err)
	}
	return pkg
}

func sheetCatalog(t *testing.T, field string) *platform.Catalog {
	t.Helper()
	app := load(t, `{"type":"application","owner":"acme","host":"rpg","name":"game","server":{"application":{"entry":"main.mjs"},"data":[{".name":"Sheet","owner":{".type":"string"},"`+field+`":{".type":"string"},"hp":{".type":"integer",".default":10}}]}}`, map[string]string{"main.mjs": sheetMain})
	notes := load(t, `{"type":"module","owner":"acme","host":"rpg","name":"notes","server":{"library":{"entry":"notes.mjs"},"data":[{".modify":"Sheet","notes":{".type":"string",".default":""}}]}}`, map[string]string{"notes.mjs": ""})
	return &platform.Catalog{Applications: map[string]manifest.Package{app.ID(): app}, Modules: map[string]manifest.Package{notes.ID(): notes}}
}

func call(t *testing.T, manager *games.Manager, id, message string) json.RawMessage {
	t.Helper()
	runtime, running := manager.Runtime(id)
	if !running {
		t.Fatal("game is not running")
	}
	data, err := runtime.Dispatch(context.Background(), json.RawMessage(message))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

type world struct {
	pool    *pgxpool.Pool
	folder  string
	manager *games.Manager
	game    games.Game
	ada     accounts.User
	bob     accounts.User
}

func build(t *testing.T) world {
	t.Helper()
	ctx := context.Background()
	w := world{pool: dbtest.Open(t), folder: t.TempDir()}
	w.manager = &games.Manager{Pool: w.pool, Catalog: sheetCatalog(t, "title"), Folder: w.folder}
	t.Cleanup(w.manager.Close)
	service := &accounts.Service{Pool: w.pool}
	var err error
	if w.ada, err = service.SignUp(ctx, "ada", "correct horse", "Ada"); err != nil {
		t.Fatal(err)
	}
	if w.bob, err = service.SignUp(ctx, "bob", "correct horse", "Bob"); err != nil {
		t.Fatal(err)
	}
	if w.game, err = w.manager.Create(ctx, "Campaign", "acme.rpg.game", []string{"acme.rpg.notes"}, games.Open); err != nil {
		t.Fatal(err)
	}
	for _, user := range []accounts.User{w.ada, w.bob} {
		if err := w.manager.Join(ctx, w.game.ID, user); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.manager.Start(ctx, w.game.ID); err != nil {
		t.Fatal(err)
	}
	call(t, w.manager, w.game.ID, `{"op":"create","owner":"`+w.ada.ID+`","title":"Valeros","notes":"brave"}`)
	call(t, w.manager, w.game.ID, `{"op":"create","owner":"`+w.bob.ID+`","title":"Merisiel","notes":"quick"}`)
	return w
}

func TestBackupRestoresIntoACleanInstallation(t *testing.T) {
	ctx := context.Background()
	w := build(t)
	config := t.TempDir()
	if err := os.WriteFile(filepath.Join(config, "auth.json"), []byte(`{"public_url":"https://play.example"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "easel.zip")
	header, err := portable.Backup(ctx, w.pool, archive, portable.BackupOptions{GamesDir: w.folder, ConfigDir: config})
	if err != nil {
		t.Fatal(err)
	}
	if header.Rows["accounts.users"] != 2 || header.Rows["game_data.records"] != 2 || header.Rows["game_data.files"] != 2 || header.Files != 3 {
		t.Fatalf("backup contents: %+v", header)
	}
	if _, err := portable.Restore(ctx, w.pool, archive, portable.RestoreOptions{SchemaPath: schemaPath, GamesDir: t.TempDir()}); err == nil || !strings.Contains(err.Error(), "clean installation") {
		t.Fatalf("restore over existing data: %v", err)
	}
	w.manager.Close()

	clean := dbtest.Open(t)
	folder, restoredConfig := t.TempDir(), t.TempDir()
	if err := os.WriteFile(filepath.Join(restoredConfig, "auth.json"), []byte(`{"public_url":"https://new.example"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	report, err := portable.Restore(ctx, clean, archive, portable.RestoreOptions{SchemaPath: schemaPath, GamesDir: folder, ConfigDir: restoredConfig})
	if err != nil {
		t.Fatal(err)
	}
	if report.Files != 2 || len(report.KeptExisting) != 1 {
		t.Fatalf("restore report: %+v", report)
	}
	if kept, _ := os.ReadFile(filepath.Join(restoredConfig, "auth.json")); !strings.Contains(string(kept), "new.example") {
		t.Fatal("restore overwrote existing configuration")
	}
	if user, err := (&accounts.Service{Pool: clean}).Login(ctx, "ada", "correct horse"); err != nil || user.ID != w.ada.ID {
		t.Fatalf("restored account: %+v %v", user, err)
	}
	manager := &games.Manager{Pool: clean, Catalog: sheetCatalog(t, "title"), Folder: folder}
	t.Cleanup(manager.Close)
	listed, err := manager.List(ctx)
	if err != nil || len(listed) != 1 || listed[0].ID != w.game.ID || listed[0].Name != "Campaign" {
		t.Fatalf("restored games: %+v %v", listed, err)
	}
	if err := manager.Start(ctx, w.game.ID); err != nil {
		t.Fatal(err)
	}
	if sheets := string(call(t, manager, w.game.ID, `{"op":"list"}`)); !strings.Contains(sheets, "Valeros") || !strings.Contains(sheets, "quick") {
		t.Fatalf("restored records: %s", sheets)
	}
	if stored := string(call(t, manager, w.game.ID, `{"op":"files"}`)); !strings.Contains(stored, "portrait of Merisiel") {
		t.Fatalf("restored files: %s", stored)
	}
	call(t, manager, w.game.ID, `{"op":"create","owner":"`+w.ada.ID+`","title":"Kyra"}`)
	if member, err := manager.IsMember(ctx, w.game.ID, w.bob.ID); err != nil || !member {
		t.Fatalf("restored membership: %v %v", member, err)
	}
	var revisions int
	if err := clean.QueryRow(ctx, `SELECT count(*) FROM game_data.contract_revisions WHERE sealed_at IS NOT NULL`).Scan(&revisions); err != nil || revisions != 1 {
		t.Fatalf("restored revisions: %d %v", revisions, err)
	}
}

func TestGameExportImportsWithMappedAccounts(t *testing.T) {
	ctx := context.Background()
	w := build(t)
	archive := filepath.Join(t.TempDir(), "campaign.zip")
	header, err := portable.Export(ctx, w.pool, w.game.ID, archive, portable.ExportOptions{GamesDir: w.folder})
	if err != nil {
		t.Fatal(err)
	}
	if header.Application != "acme.rpg.game" || len(header.Accounts) != 2 || len(header.Requires) != 2 || header.Files != 2 {
		t.Fatalf("export header: %+v", header)
	}
	other, err := database.EnsureServer(ctx, w.pool, "other")
	if err != nil {
		t.Fatal(err)
	}
	remote := &accounts.Service{Pool: w.pool, ServerID: other}
	remoteAda, err := remote.SignUp(ctx, "ada", "another horse", "Ada Elsewhere")
	if err != nil {
		t.Fatal(err)
	}
	folder := t.TempDir()
	catalog := sheetCatalog(t, "title")
	installed := func(id string) bool {
		_, application := catalog.Applications[id]
		_, module := catalog.Modules[id]
		return application || module
	}
	if _, err := portable.Import(ctx, w.pool, archive, portable.ImportOptions{GamesDir: folder, ServerID: other, Installed: func(string) bool { return false }}); err == nil || !strings.Contains(err.Error(), "install acme.rpg.game") {
		t.Fatalf("import without the application: %v", err)
	}
	if _, err := portable.Import(ctx, w.pool, archive, portable.ImportOptions{GamesDir: folder, ServerID: other, Installed: installed, Accounts: map[string]string{w.bob.ID: "nobody"}}); err == nil || !strings.Contains(err.Error(), "not an account on this server") {
		t.Fatalf("import with an unknown mapping: %v", err)
	}
	report, err := portable.Import(ctx, w.pool, archive, portable.ImportOptions{GamesDir: folder, ServerID: other, Installed: installed, MatchUsernames: true, Name: "Campaign copy"})
	if err != nil {
		t.Fatal(err)
	}
	if report.Game == w.game.ID || report.Files != 2 || len(report.Accounts) != 2 {
		t.Fatalf("import report: %+v", report)
	}
	placeholder := ""
	for _, account := range report.Accounts {
		switch account.From {
		case w.ada.ID:
			if account.To != remoteAda.ID || account.Placeholder {
				t.Fatalf("ada was not matched by username: %+v", account)
			}
		case w.bob.ID:
			if !account.Placeholder || account.To == w.bob.ID {
				t.Fatalf("bob did not become a placeholder: %+v", account)
			}
			placeholder = account.To
		}
	}
	manager := &games.Manager{Pool: w.pool, Catalog: catalog, Folder: folder, ServerID: other}
	t.Cleanup(manager.Close)
	listed, err := manager.List(ctx)
	if err != nil || len(listed) != 1 || listed[0].Name != "Campaign copy" || listed[0].Lifecycle != "stopped" {
		t.Fatalf("imported game: %+v %v", listed, err)
	}
	if original, err := w.manager.List(ctx); err != nil || len(original) != 1 {
		t.Fatalf("the source server sees the import: %+v %v", original, err)
	}
	if err := manager.Start(ctx, report.Game); err != nil {
		t.Fatal(err)
	}
	sheets := string(call(t, manager, report.Game, `{"op":"list"}`))
	if !strings.Contains(sheets, remoteAda.ID) || !strings.Contains(sheets, placeholder) || strings.Contains(sheets, w.ada.ID) || strings.Contains(sheets, w.bob.ID) {
		t.Fatalf("account references were not rewritten: %s", sheets)
	}
	if stored := string(call(t, manager, report.Game, `{"op":"files"}`)); !strings.Contains(stored, "portrait of Valeros") {
		t.Fatalf("imported files: %s", stored)
	}
	if member, err := manager.IsMember(ctx, report.Game, remoteAda.ID); err != nil || !member {
		t.Fatalf("mapped member: %v %v", member, err)
	}
	if err := manager.Stop(report.Game); err != nil {
		t.Fatal(err)
	}
	remoteBob, err := remote.SignUp(ctx, "robert", "correct horse", "Robert")
	if err != nil {
		t.Fatal(err)
	}
	if err := portable.Reassign(ctx, w.pool, other, report.Game, placeholder, remoteAda.ID); err == nil || !strings.Contains(err.Error(), "already in game") {
		t.Fatalf("reassigning onto a member: %v", err)
	}
	if err := portable.Reassign(ctx, w.pool, other, report.Game, placeholder, remoteBob.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, report.Game); err != nil {
		t.Fatal(err)
	}
	if sheets := string(call(t, manager, report.Game, `{"op":"list"}`)); !strings.Contains(sheets, remoteBob.ID) || strings.Contains(sheets, placeholder) {
		t.Fatalf("placeholder references were not reassigned: %s", sheets)
	}
	if member, err := manager.IsMember(ctx, report.Game, remoteBob.ID); err != nil || !member {
		t.Fatalf("reassigned member: %v %v", member, err)
	}
	if _, _, err := remote.Account(ctx, placeholder); !errors.Is(err, accounts.ErrNoAccount) {
		t.Fatalf("the placeholder account remains: %v", err)
	}
	sheets = string(call(t, w.manager, w.game.ID, `{"op":"list"}`))
	if !strings.Contains(sheets, w.ada.ID) || !strings.Contains(sheets, w.bob.ID) {
		t.Fatalf("the source game changed: %s", sheets)
	}
}

func TestMigrationPlansConvertAndCleanUp(t *testing.T) {
	ctx := context.Background()
	w := build(t)
	if _, err := w.manager.ApplyMigration(ctx, w.game.ID, games.MigrationPlan{}); !errors.Is(err, games.ErrRunning) {
		t.Fatalf("migrating a running game: %v", err)
	}
	other := &games.Manager{Pool: w.pool, Catalog: sheetCatalog(t, "title"), Folder: w.folder}
	t.Cleanup(other.Close)
	if err := other.Start(ctx, w.game.ID); !errors.Is(err, games.ErrOwnedElsewhere) {
		t.Fatalf("a second process started a running game: %v", err)
	}
	if _, err := other.Claim(ctx, w.game.ID); !errors.Is(err, games.ErrOwnedElsewhere) {
		t.Fatalf("a second process claimed a running game: %v", err)
	}
	if err := w.manager.Stop(w.game.ID); err != nil {
		t.Fatal(err)
	}
	renamed := &games.Manager{Pool: w.pool, Catalog: sheetCatalog(t, "name"), Folder: w.folder}
	t.Cleanup(renamed.Close)
	if err := renamed.Start(ctx, w.game.ID); err == nil || !strings.Contains(err.Error(), "explicit migration") {
		t.Fatalf("an incompatible package started: %v", err)
	}
	status, err := renamed.SchemaStatus(ctx, w.game.ID)
	if err != nil || status.Pending == "" || status.Types["acme.rpg.Sheet"] != 2 || len(status.Contributors) != 2 {
		t.Fatalf("schema status: %+v %v", status, err)
	}
	plan, err := games.ParseMigrationPlan([]byte(`{"records":[{"type":"acme.rpg.Sheet","rename":{"title":"name"},"default":{"hp":12}}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := games.ParseMigrationPlan([]byte(`{"records":[{"type":"acme.rpg.Sheet","delete":true,"unset":["hp"]}]}`)); err == nil {
		t.Fatal("a contradictory plan was accepted")
	}
	if _, err := renamed.ApplyMigration(ctx, w.game.ID, games.MigrationPlan{}); err == nil {
		t.Fatal("a migration that leaves records invalid was applied")
	}
	stale := plan
	stale.FromRevision = "00000000-0000-0000-0000-000000000001"
	if _, err := renamed.ApplyMigration(ctx, w.game.ID, stale); err == nil || !strings.Contains(err.Error(), "written for revision") {
		t.Fatalf("a stale plan was applied: %v", err)
	}
	plan.DryRun = true
	report, err := renamed.ApplyMigration(ctx, w.game.ID, plan)
	if err != nil || report.Converted != 2 || report.Revision != "" || !report.DryRun {
		t.Fatalf("dry run: %+v %v", report, err)
	}
	if after, err := renamed.SchemaStatus(ctx, w.game.ID); err != nil || after.Revision != status.Revision {
		t.Fatalf("a dry run changed the schema: %+v %v", after, err)
	}
	plan.DryRun = false
	report, err = renamed.ApplyMigration(ctx, w.game.ID, plan)
	if err != nil || report.Converted != 2 || report.Revision == "" || report.Revision == status.Revision {
		t.Fatalf("migration: %+v %v", report, err)
	}
	if err := renamed.Start(ctx, w.game.ID); err != nil {
		t.Fatal(err)
	}
	if sheets := string(call(t, renamed, w.game.ID, `{"op":"list"}`)); !strings.Contains(sheets, `"name":"Valeros"`) || !strings.Contains(sheets, `"notes":"brave"`) || strings.Contains(sheets, `"title"`) {
		t.Fatalf("migrated records: %s", sheets)
	}
	if err := renamed.Stop(w.game.ID); err != nil {
		t.Fatal(err)
	}
	cleanup, err := games.ParseMigrationPlan([]byte(`{"remove":{"contributors":["acme.rpg.notes"]}}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := renamed.ApplyMigration(ctx, w.game.ID, cleanup); err == nil {
		t.Fatal("cleanup left undeclared fields without being told to drop them")
	}
	cleanup.DropUndeclaredFields = true
	report, err = renamed.ApplyMigration(ctx, w.game.ID, cleanup)
	if err != nil || len(report.Removed) != 1 || report.Converted != 2 {
		t.Fatalf("cleanup: %+v %v", report, err)
	}
	status, err = renamed.SchemaStatus(ctx, w.game.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, contributor := range status.Contributors {
		if contributor.Name == "acme.rpg.notes" && (len(contributor.Declarations) != 0 || contributor.Fragments != 0) {
			t.Fatalf("removed contributor still holds data: %+v", contributor)
		}
	}
	if _, err := renamed.ApplyMigration(ctx, w.game.ID, games.MigrationPlan{Records: []games.RecordRule{{Type: "acme.rpg.Missing", Delete: true}}}); err == nil {
		t.Fatal("a plan naming an unknown type was applied")
	}
}
