package pgstore

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"testing/fstest"

	"easel/internal/automation"
	"easel/internal/database/dbtest"
	"easel/internal/manifest"
	"easel/internal/schema"
	"easel/internal/session"
	"github.com/jackc/pgx/v5"
)

func TestSchemaSurvivesModuleRemoval(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	app := testPackage(t, `{"type":"application","name":"game","owner":"easel","host":"acme","server":{"application":{"entry":"index.mjs"},"data":[{".name":"Character",".extends":"easel.base.Actor","name":{".type":"string"}}]}}`)
	app.Files.(fstest.MapFS)["index.mjs"].Data = []byte(`export function handleMessage(message) {
 const actor = new easel.acme.Character(message.id);
 const spell = new easel.arcane.Spell(message.spell);
 actor.mana += 1;
 actor.save();
 return {mana:actor.mana, name:spell.name, inherited:actor instanceof easel.base.Actor};
}`)
	base := testPackage(t, `{"type":"module","name":"records","owner":"easel","host":"base","server":{"library":{"entry":"index.mjs"},"data":[{".name":"Actor","portrait":{".type":"string",".required":false}}]}}`)
	magic := testPackage(t, `{"type":"module","name":"magic","owner":"easel","host":"arcane","server":{"library":{"entry":"index.mjs"},"data":[{".modify":"easel.acme.Character","mana":{".type":"integer",".required":false}},{".name":"Spell","name":{".type":"string"}}]}}`)
	resolve := func(packages ...manifest.Package) manifest.Plan {
		t.Helper()
		plan, err := manifest.Resolve(packages)
		if err != nil {
			t.Fatal(err)
		}
		return plan
	}
	revisions := &Revisions{Pool: pool}
	gameID, err := revisions.CreateGame(ctx, "retained rules", app)
	if err != nil {
		t.Fatal(err)
	}
	composed := &schema.Schema{}
	full := resolve(app, base, magic)
	if _, err := revisions.CurrentRevision(ctx, gameID, full, composed); err != nil {
		t.Fatal(err)
	}
	records := &Records{Pool: pool, GameID: gameID, Schema: composed, AuthorizeRecord: func(context.Context, pgx.Tx, string, automation.Record) error { return nil }}
	tx, err := records.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	character, err := tx.Create(ctx, automation.Record{Type: "easel.acme.Character", Data: map[string]any{"name": "Ada", "mana": 3}})
	if err != nil {
		t.Fatal(err)
	}
	spell, err := tx.Create(ctx, automation.Record{Type: "easel.arcane.Spell", Data: map[string]any{"name": "Light"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	removed := resolve(app)
	for index, plan := range []manifest.Plan{removed, removed, full, removed} {
		loaded := &schema.Schema{}
		if _, err := revisions.CurrentRevision(ctx, gameID, plan, loaded); err != nil {
			t.Fatal(err)
		}
		if !loaded.IsA(character.Type, "easel.base.Actor") || loaded.Types[character.Type].Fields["mana"].Owner != magic.ID() {
			t.Fatalf("lost inheritance or field attribution: %+v", loaded)
		}
		records.Schema = loaded
		tx, err := records.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		found, err := tx.Load(ctx, "easel.base.Actor", character.ID)
		if err != nil {
			t.Fatal(err)
		}
		if found.Data["name"] != "Ada" || found.Data["mana"].(interface{ String() string }).String() != fmt.Sprint(3+index) {
			t.Fatalf("lost data: %+v", found)
		}
		found.Data["name"] = "Ada"
		if err := tx.Save(ctx, found); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Load(ctx, spell.Type, spell.ID); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		runtime, err := session.NewGame(ctx, session.Game{Packages: plan.Packages, Schema: loaded, Records: records})
		if err != nil {
			t.Fatal(err)
		}
		message, _ := json.Marshal(map[string]string{"id": character.ID, "spell": spell.ID})
		result, err := runtime.Dispatch(ctx, message)
		if err != nil || !strings.Contains(string(result), `"inherited":true`) || !strings.Contains(string(result), `"name":"Light"`) {
			t.Fatalf("retained classes unavailable in runtime: %s %v", result, err)
		}
		if err := runtime.Close(); err != nil {
			t.Fatal(err)
		}
	}
	var before string
	if err := pool.QueryRow(ctx, `SELECT active_revision_id::text FROM game_data.games WHERE game_id=$1`, gameID).Scan(&before); err != nil {
		t.Fatal(err)
	}
	for _, declaration := range []string{
		`{".name":"Character",".extends":"easel.base.Actor","name":{".type":"integer"}}`,
		`{".name":"Character",".extends":"easel.base.Actor","name":{".type":"string"},"level":{".type":"integer"}}`,
	} {
		changed := testPackage(t, `{"type":"application","name":"game","owner":"easel","host":"acme","server":{"application":{"entry":"index.mjs"},"data":[`+declaration+`]}}`)
		if _, err := revisions.CurrentRevision(ctx, gameID, resolve(changed), &schema.Schema{}); err == nil || !strings.Contains(err.Error(), "explicit migration") {
			t.Fatalf("unsafe schema accepted: %v", err)
		}
		var active string
		if err := pool.QueryRow(ctx, `SELECT active_revision_id::text FROM game_data.games WHERE game_id=$1`, gameID).Scan(&active); err != nil {
			t.Fatal(err)
		}
		if active != before {
			t.Fatal("failed schema changed active revision")
		}
	}
}
