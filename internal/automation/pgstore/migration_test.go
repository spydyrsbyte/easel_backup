package pgstore

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"easel/internal/automation"
	"easel/internal/database/dbtest"
	"easel/internal/manifest"
	"easel/internal/schema"
	"github.com/jackc/pgx/v5"
)

func TestSchemaMigrationAtomicAndCleanup(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	app := testPackage(t, `{"type":"application","name":"game","owner":"easel","host":"acme","server":{"application":{"entry":"index.mjs"},"data":[{".name":"Character","name":{".type":"string"},"spell":{".type":"*easel.arcane.Spell",".required":false}}]}}`)
	magic := testPackage(t, `{"type":"module","name":"magic","owner":"easel","host":"arcane","server":{"library":{"entry":"index.mjs"},"data":[{".modify":"easel.acme.Character","mana":{".type":"integer",".required":false}},{".name":"Spell","name":{".type":"string"}}]}}`)
	plan, err := manifest.Resolve([]manifest.Package{app, magic})
	if err != nil {
		t.Fatal(err)
	}
	revisions := &Revisions{Pool: pool}
	gameID, err := revisions.CreateGame(ctx, "migration", app)
	if err != nil {
		t.Fatal(err)
	}
	composed := &schema.Schema{}
	before, err := revisions.CurrentRevision(ctx, gameID, plan, composed)
	if err != nil {
		t.Fatal(err)
	}
	records := &Records{Pool: pool, GameID: gameID, Schema: composed, AuthorizeRecord: func(context.Context, pgx.Tx, string, automation.Record) error { return nil }}
	tx, err := records.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	spell, err := tx.Create(ctx, automation.Record{Type: "easel.arcane.Spell", Data: map[string]any{"name": "Light"}})
	if err != nil {
		t.Fatal(err)
	}
	character, err := tx.Create(ctx, automation.Record{Type: "easel.acme.Character", Data: map[string]any{"name": "Ada", "mana": 3, "spell": spell.ID}})
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	target := testPackage(t, `{"type":"application","name":"game","owner":"easel","host":"acme","server":{"application":{"entry":"index.mjs"},"data":[{".name":"Character","label":{".type":"string"}}]}}`)
	targetPlan, err := manifest.Resolve([]manifest.Package{target})
	if err != nil {
		t.Fatal(err)
	}
	rules, err := schema.PackageRules(targetPlan.Packages)
	if err != nil {
		t.Fatal(err)
	}
	transform := func(_ context.Context, record automation.Record) (*automation.Record, error) {
		if record.Type == spell.Type {
			return nil, nil
		}
		record.Data["label"] = record.Data["name"]
		delete(record.Data, "name")
		delete(record.Data, "mana")
		delete(record.Data, "spell")
		return &record, nil
	}
	calls := 0
	failed := SchemaMigration{FromRevision: before, Rules: rules, Transform: func(ctx context.Context, record automation.Record) (*automation.Record, error) {
		calls++
		if calls == 2 {
			return nil, fmt.Errorf("conversion failed")
		}
		return transform(ctx, record)
	}}
	if _, _, err := revisions.Migrate(ctx, gameID, targetPlan, failed); err == nil || !strings.Contains(err.Error(), "conversion failed") {
		t.Fatalf("failed migration committed: %v", err)
	}
	active, saved, loaded, err := revisions.LoadSchema(ctx, gameID)
	if err != nil {
		t.Fatal(err)
	}
	if active != before || len(saved) != 3 || loaded.Types[character.Type].Fields["name"] == nil {
		t.Fatal("failed migration changed schema")
	}
	tx, err = records.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found, err := tx.Load(ctx, character.Type, character.ID)
	if err != nil || found.Data["name"] != "Ada" || found.Version != character.Version {
		t.Fatalf("failed migration changed data: %+v %v", found, err)
	}
	if _, err := tx.Load(ctx, spell.Type, spell.ID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	dangling := SchemaMigration{FromRevision: before, Rules: saved, Transform: func(_ context.Context, record automation.Record) (*automation.Record, error) {
		if record.Type == spell.Type {
			return nil, nil
		}
		return &record, nil
	}}
	if _, _, err := revisions.Migrate(ctx, gameID, plan, dangling); err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("migration left a dangling reference: %v", err)
	}
	migration := SchemaMigration{FromRevision: before, Rules: rules, Transform: transform}
	after, migrated, err := revisions.Migrate(ctx, gameID, targetPlan, migration)
	if err != nil {
		t.Fatal(err)
	}
	if after == before || migrated.Types[character.Type].Fields["mana"] != nil || migrated.Types[spell.Type] != nil {
		t.Fatal("cleanup did not remove selected schema rules")
	}
	if _, _, err := revisions.Migrate(ctx, gameID, targetPlan, migration); err == nil || !strings.Contains(err.Error(), "no longer active") {
		t.Fatalf("stale migration accepted: %v", err)
	}
	restarted := &schema.Schema{}
	if revision, err := revisions.CurrentRevision(ctx, gameID, targetPlan, restarted); err != nil || revision != after {
		t.Fatalf("migration did not survive restart: %s %v", revision, err)
	}
	records.Schema = restarted
	tx, err = records.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	found, err = tx.Load(ctx, character.Type, character.ID)
	if err != nil || found.Data["label"] != "Ada" || len(found.Data) != 1 {
		t.Fatalf("converted data: %+v %v", found, err)
	}
	if _, err := tx.Load(ctx, spell.Type, spell.ID); err == nil {
		t.Fatal("cleanup retained deleted spell")
	}
}
