package games

import (
	"context"
	"errors"
	"strings"
	"testing"
	"testing/fstest"

	"easel/internal/automation/pgstore"
	"easel/internal/database/dbtest"
	"easel/internal/manifest"
	"easel/internal/platform"
)

func TestGameStartsWithRetainedSchemaAfterUninstall(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	load := func(text string) manifest.Package {
		t.Helper()
		pkg, err := manifest.Load(fstest.MapFS{manifest.FileName: {Data: []byte(text)}, "index.mjs": {Data: []byte("")}})
		if err != nil {
			t.Fatal(err)
		}
		return pkg
	}
	app := load(`{"type":"application","owner":"easel","host":"acme","name":"game","server":{"application":{"entry":"index.mjs"},"data":[{".name":"Character",".extends":"easel.base.Actor"}]}}`)
	base := load(`{"type":"module","owner":"easel","host":"base","name":"records","server":{"library":{"entry":"index.mjs"},"data":[{".name":"Actor","name":{".type":"string"}}]}}`)
	catalog := &platform.Catalog{Applications: map[string]manifest.Package{app.ID(): app}, Modules: map[string]manifest.Package{base.ID(): base}}
	manager := &Manager{Pool: pool, Catalog: catalog, Folder: t.TempDir()}
	t.Cleanup(manager.Close)
	game, err := manager.Create(ctx, "retained", app.ID(), []string{base.ID()}, Open)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, game.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.MigrateSchema(ctx, game.ID, pgstore.SchemaMigration{}); !errors.Is(err, ErrRunning) {
		t.Fatalf("running game migration accepted: %v", err)
	}
	if err := manager.Stop(game.ID); err != nil {
		t.Fatal(err)
	}
	delete(catalog.Modules, base.ID())
	for index := 0; index < 2; index++ {
		if err := manager.Start(ctx, game.ID); err != nil {
			t.Fatal(err)
		}
		if err := manager.Stop(game.ID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := manager.Create(ctx, "unknown module", app.ID(), []string{base.ID()}, Open); err == nil || !strings.Contains(err.Error(), "not installed") {
		t.Fatalf("new game accepted unavailable module: %v", err)
	}
	app.Manifest.Server.Application.Required.Modules = []string{base.ID()}
	catalog.Applications[app.ID()] = app
	if err := manager.Start(ctx, game.ID); err == nil || !strings.Contains(err.Error(), "not installed") {
		t.Fatalf("missing executable dependency accepted: %v", err)
	}
}
