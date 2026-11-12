package dbtest

import (
	"context"
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"easel/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const prefix = "easel_test_"

func Open(t *testing.T) *pgxpool.Pool {
	t.Helper()
	path := os.Getenv("EASEL_TEST_DATABASE_CONFIG")
	if path == "" {
		t.Skip("set EASEL_TEST_DATABASE_CONFIG to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	settings, err := database.LoadConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	admin, err := database.Open(ctx, settings)
	if err != nil {
		t.Fatal(err)
	}
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("%s%d_%x", prefix, time.Now().UnixNano(), suffix)
	quoted := pgx.Identifier{name}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+quoted); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	config := admin.Config().Copy()
	config.ConnConfig.Database = name
	pool, err := pgxpool.NewWithConfig(ctx, config)
	t.Cleanup(func() {
		if pool != nil {
			pool.Close()
		}
		if !strings.HasPrefix(name, prefix) {
			t.Error("refusing to drop unexpected database")
			return
		}
		if _, err := admin.Exec(ctx, "DROP DATABASE "+quoted+" WITH (FORCE)"); err != nil {
			t.Error(err)
		}
		admin.Close()
	})
	if err != nil {
		t.Fatal(err)
	}
	_, file, _, _ := runtime.Caller(0)
	schema, err := os.ReadFile(filepath.Join(filepath.Dir(file), "..", "..", "..", "server", "easel", "database", "schema.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(schema)); err != nil {
		t.Fatal(err)
	}
	return pool
}
