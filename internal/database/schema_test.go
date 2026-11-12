package database_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"easel/internal/database"
	"easel/internal/database/dbtest"
)

func TestInitializePreservesExistingData(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `DROP SCHEMA game_data CASCADE; DROP SCHEMA accounts CASCADE; DROP SCHEMA hosting CASCADE`); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join("..", "..", "server", "easel", "database", "schema.sql")
	if err := database.Initialize(ctx, pool, path); err != nil {
		t.Fatal(err)
	}
	var id string
	if err := pool.QueryRow(ctx, `INSERT INTO accounts.users(display_name) VALUES('Existing player') RETURNING user_id::text`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `DROP SCHEMA game_data CASCADE`); err != nil {
		t.Fatal(err)
	}
	if err := database.Initialize(ctx, pool, path); err != nil {
		t.Fatal(err)
	}
	var display string
	if err := pool.QueryRow(ctx, `SELECT display_name FROM accounts.users WHERE user_id=$1`, id).Scan(&display); err != nil || display != "Existing player" {
		t.Fatal("existing account changed", err)
	}
	if _, err := pool.Exec(ctx, `DROP TABLE game_data.members`); err != nil {
		t.Fatal(err)
	}
	if err := database.Initialize(ctx, pool, path); err == nil || !strings.Contains(err.Error(), "game_data schema is incomplete") {
		t.Fatal("partial schema was not diagnosed", err)
	}
}

func TestInitializeRefusesOtherSchemaVersions(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	path := filepath.Join("..", "..", "server", "easel", "database", "schema.sql")
	if err := database.Initialize(ctx, pool, path); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE hosting.installation SET schema_version=1`); err != nil {
		t.Fatal(err)
	}
	if err := database.Initialize(ctx, pool, path); err == nil || !strings.Contains(err.Error(), "needs version") {
		t.Fatal("an older schema version was accepted", err)
	}
	if _, err := pool.Exec(ctx, `DROP SCHEMA hosting CASCADE`); err != nil {
		t.Fatal(err)
	}
	if err := database.Initialize(ctx, pool, path); err == nil || !strings.Contains(err.Error(), "no schema version") {
		t.Fatal("an unversioned database was accepted", err)
	}
}

func TestEnsureServerIsStable(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	first, err := database.EnsureServer(ctx, pool, "club")
	if err != nil {
		t.Fatal(err)
	}
	second, err := database.EnsureServer(ctx, pool, "club")
	if err != nil || first != second || first == database.DefaultServerID {
		t.Fatal("server identity is not stable", first, second, err)
	}
	if id, err := database.EnsureServer(ctx, pool, "default"); err != nil || id != database.DefaultServerID {
		t.Fatal("default server", id, err)
	}
	if _, err := database.EnsureServer(ctx, pool, "Not Valid"); err == nil {
		t.Fatal("invalid server name accepted")
	}
}
