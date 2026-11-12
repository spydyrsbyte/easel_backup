package pgstore

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"testing/fstest"

	"easel/internal/automation"
	"easel/internal/database/dbtest"
	"easel/internal/manifest"
	"easel/internal/schema"
	"easel/internal/security"
	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func testPackage(t *testing.T, manifestJSON string) manifest.Package {
	t.Helper()
	p, err := manifest.Load(fstest.MapFS{manifest.FileName: {Data: []byte(manifestJSON)}, "index.mjs": {Data: []byte(``)}})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestPublishRevisionAndValidateRecords(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	game := testPackage(t, `{"type":"application","name":"game","owner":"easel","host":"acme","version":{"major":1,"minor":2,"revision":3},"server":{"application":{"entry":"index.mjs"},"data":[{".name":"character","name":{".type":"string"},"hp":{".type":"integer",".validate":{".min":0}},"partner":{".type":"*character",".required":false}}]}}`)
	magic := testPackage(t, `{"type":"module","name":"magic","owner":"easel","host":"arcane","server":{"library":{"entry":"index.mjs"},"interfaces":["spell@1"],"data":[{".modify":"easel.acme.character","mana":{".type":"integer",".required":false}}]}}`)
	plan, err := manifest.Resolve([]manifest.Package{game, magic})
	if err != nil {
		t.Fatal(err)
	}
	composed, err := schema.Compose(plan.Packages)
	if err != nil {
		t.Fatal(err)
	}
	revisions := &Revisions{Pool: pool}
	gameID, err := revisions.CreateGame(ctx, "test game", game)
	if err != nil {
		t.Fatal(err)
	}
	first, err := revisions.Publish(ctx, gameID, plan, composed)
	if err != nil {
		t.Fatal(err)
	}
	var active string
	var contributions, schemas int
	if err := pool.QueryRow(ctx, `SELECT g.active_revision_id::text,
 (SELECT count(*) FROM game_data.revision_contributions c WHERE c.revision_id=g.active_revision_id),
 (SELECT count(*) FROM game_data.effective_schemas s WHERE s.revision_id=g.active_revision_id)
 FROM game_data.games g WHERE g.game_id=$1`, gameID).Scan(&active, &contributions, &schemas); err != nil {
		t.Fatal(err)
	}
	if active != first || contributions != 2 || schemas != 1 {
		t.Fatalf("revision: active %s (want %s), %d contributions, %d schemas", active, first, contributions, schemas)
	}
	var stored []byte
	if err := pool.QueryRow(ctx, `SELECT payload_bson FROM game_data.effective_schemas WHERE revision_id=$1`, first).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	effective := bson.Raw(stored)
	if name, owner := effective.Lookup(".name").StringValue(), effective.Lookup("mana", ".owner").StringValue(); name != "easel.acme.character" || owner != "easel.arcane.magic" {
		t.Fatalf("effective schema: %s", effective)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM game_data.effective_schemas WHERE revision_id=$1`, first); err == nil || !strings.Contains(err.Error(), "immutable") {
		t.Fatalf("sealed revision changed: %v", err)
	}

	var recordID string
	if err := pool.QueryRow(ctx, `INSERT INTO game_data.records(game_id,record_type_id,last_validated_revision_id)
 SELECT game_id,record_type_id,$2 FROM game_data.record_types WHERE game_id=$1 AND name='easel.acme.character' RETURNING record_id::text`, gameID, first).Scan(&recordID); err != nil {
		t.Fatal(err)
	}
	for owner, fragment := range map[string]bson.M{"easel.acme.game": {"name": "Ada", "hp": int64(10)}, "easel.arcane.magic": {"mana": int64(3)}} {
		payload, err := bson.Marshal(fragment)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO game_data.record_fragments(game_id,record_id,contributor_id,payload_bson)
 SELECT $1,$2,contributor_id,$4 FROM game_data.contributors WHERE game_id=$1 AND name=$3`, gameID, recordID, owner, payload); err != nil {
			t.Fatal(err)
		}
	}
	records := &Records{Pool: pool, GameID: gameID, Schema: composed, AuthorizeRecord: func(context.Context, pgx.Tx, string, automation.Record) error { return nil }}
	save := func(change func(map[string]any)) error {
		t.Helper()
		tx, err := records.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.Background())
		record, err := tx.Load(ctx, "easel.acme.character", recordID)
		if err != nil {
			t.Fatal(err)
		}
		if record.Type != "easel.acme.character" || record.Data["name"] != "Ada" {
			t.Fatalf("loaded: %+v", record)
		}
		change(record.Data)
		if err := tx.Save(ctx, record); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if err := save(func(data map[string]any) { data["hp"] = json.Number("12"); data["partner"] = recordID }); err != nil {
		t.Fatal(err)
	}
	for name, test := range map[string]struct {
		change func(map[string]any)
		want   string
	}{
		"type":             {func(data map[string]any) { data["hp"] = "many" }, "must be integer"},
		"rule":             {func(data map[string]any) { data["hp"] = json.Number("-1") }, "below the minimum"},
		"missing partner":  {func(data map[string]any) { data["partner"] = "10000000-0000-0000-0000-00000000dead" }, "does not exist"},
		"undeclared field": {func(data map[string]any) { data["armor"] = json.Number("1") }, "undeclared field armor"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := save(test.change); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	if found, err := records.RecordType(ctx, recordID); err != nil || found != "easel.acme.character" {
		t.Fatalf("record type: %s %v", found, err)
	}

	second, err := revisions.Publish(ctx, gameID, plan, composed)
	if err != nil {
		t.Fatal(err)
	}
	var parent string
	if err := pool.QueryRow(ctx, `SELECT parent_revision_id::text FROM game_data.contract_revisions WHERE revision_id=$1`, second).Scan(&parent); err != nil || parent != first {
		t.Fatalf("parent: %s %v", parent, err)
	}
	other := testPackage(t, `{"type":"application","name":"other","owner":"easel","host":"acme","server":{"application":{"entry":"index.mjs"}}}`)
	otherPlan, err := manifest.Resolve([]manifest.Package{other})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := revisions.Publish(ctx, gameID, otherPlan, &schema.Schema{Types: map[string]*schema.Type{}}); err == nil || !strings.Contains(err.Error(), "runs application easel.acme.game") {
		t.Fatalf("foreign application published: %v", err)
	}
}

func TestCreateRemoveAndSubtypes(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	game := testPackage(t, `{"type":"application","name":"game","owner":"easel","host":"pathfinder","server":{"application":{"entry":"index.mjs"},"data":[{".name":"Character","name":{".type":"string"},"hp":{".type":"integer"}},{".name":"Familiar",".extends":"Character","master":{".type":"*Character"}}]}}`)
	fear := testPackage(t, `{"type":"module","name":"fear","owner":"easel","host":"terror","server":{"library":{"entry":"index.mjs"},"interfaces":["fear@1"],"data":[{".modify":"easel.pathfinder.Character","fear":{".type":"integer"}}]}}`)
	plan, err := manifest.Resolve([]manifest.Package{game, fear})
	if err != nil {
		t.Fatal(err)
	}
	composed, err := schema.Compose(plan.Packages)
	if err != nil {
		t.Fatal(err)
	}
	revisions := &Revisions{Pool: pool}
	gameID, err := revisions.CreateGame(ctx, "subtypes", game)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := revisions.Publish(ctx, gameID, plan, composed); err != nil {
		t.Fatal(err)
	}
	records := &Records{Pool: pool, GameID: gameID, Schema: composed, AuthorizeRecord: func(context.Context, pgx.Tx, string, automation.Record) error { return nil }}
	tx, err := records.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	hero, err := tx.Create(ctx, automation.Record{Type: "easel.pathfinder.Character", Data: map[string]any{"name": "Ada", "hp": int64(10), "fear": int64(1)}})
	if err != nil {
		t.Fatal(err)
	}
	familiar, err := tx.Create(ctx, automation.Record{Type: "easel.pathfinder.Familiar", Data: map[string]any{"name": "Tib", "hp": int64(2), "fear": int64(0), "master": hero.ID}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Create(ctx, automation.Record{Type: "easel.pathfinder.Familiar", Data: map[string]any{"name": "Bad", "hp": int64(1), "fear": int64(0), "master": familiar.ID}}); err != nil {
		t.Fatalf("a familiar is a character, so it can be a master: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	tx, err = records.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	asCharacter, err := tx.Load(ctx, "easel.pathfinder.Character", familiar.ID)
	if err != nil || asCharacter.Type != "easel.pathfinder.Familiar" || asCharacter.Data["master"] != hero.ID {
		t.Fatalf("load subtype as parent: %+v %v", asCharacter, err)
	}
	if _, err := tx.Load(ctx, "easel.pathfinder.Familiar", hero.ID); err == nil || !strings.Contains(err.Error(), "not a easel.pathfinder.Familiar") {
		t.Fatalf("parent loaded as subtype: %v", err)
	}
	var owners int
	if err := pool.QueryRow(ctx, `SELECT count(DISTINCT contributor_id) FROM game_data.record_fragments WHERE record_id=$1`, familiar.ID).Scan(&owners); err != nil || owners != 2 {
		t.Fatalf("familiar fragments: %d %v", owners, err)
	}
	asCharacter.Data["hp"] = json.Number("3")
	if err := tx.Save(ctx, asCharacter); err != nil {
		t.Fatal(err)
	}
	asCharacter.Data["hp"] = json.Number("4")
	if err := tx.Save(ctx, asCharacter); err != nil {
		t.Fatalf("second save in one transaction: %v", err)
	}
	if err := tx.Remove(ctx, asCharacter); err != nil {
		t.Fatal(err)
	}
	if _, err := recordType(ctx, tx.(*postgresTransaction).tx, gameID, familiar.ID); err == nil {
		t.Fatal("removed record still exists")
	}
}

func TestSecuritySeesStoredRecords(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	game := testPackage(t, `{"type":"application","name":"game","owner":"easel","host":"acme","server":{"application":{"entry":"index.mjs"},"data":[{".name":"Character","locked":{".type":"boolean"}}]}}`)
	plan, err := manifest.Resolve([]manifest.Package{game})
	if err != nil {
		t.Fatal(err)
	}
	composed, err := schema.Compose(plan.Packages)
	if err != nil {
		t.Fatal(err)
	}
	revisions := &Revisions{Pool: pool}
	gameID, err := revisions.CreateGame(ctx, "security", game)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := revisions.Publish(ctx, gameID, plan, composed); err != nil {
		t.Fatal(err)
	}
	records := &Records{Pool: pool, GameID: gameID, Schema: composed, AuthorizeRecord: func(context.Context, pgx.Tx, string, automation.Record) error { return nil }}
	tx, err := records.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	created, err := tx.Create(ctx, automation.Record{Type: "easel.acme.Character", Data: map[string]any{"locked": true}})
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	store := &security.PostgresStore{Pool: pool, GameID: gameID, ResolveRecord: security.RecordResolver(RecordView)}
	view, err := store.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer view.Rollback(context.Background())
	entity, err := view.ResolveEntity(ctx, created.ID)
	if err != nil || entity.Type != "easel.acme.Character" || entity.Attributes["locked"] != true {
		t.Fatalf("security view of record: %+v %v", entity, err)
	}
	if _, err := view.ResolveEntity(ctx, "10000000-0000-0000-0000-00000000dead"); !errors.Is(err, security.ErrNotFound) {
		t.Fatalf("missing record: %v", err)
	}
}
