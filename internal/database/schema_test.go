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
	if _, err := pool.Exec(ctx, `DROP SCHEMA game_data CASCADE; DROP SCHEMA accounts CASCADE`); err != nil {
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
