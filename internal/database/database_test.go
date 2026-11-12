package database

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeConfig(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "database.json")
	if err := os.WriteFile(path, []byte(contents), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadConfig(t *testing.T) {
	path := writeConfig(t, `{"host":"localhost","port":5432,"database":"easel","user":"easel","password":"secret","sslmode":"disable"}`)
	settings, err := LoadConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	want := Config{Host: "localhost", Port: 5432, Database: "easel", User: "easel", Password: "secret", SSLMode: "disable"}
	if settings != want {
		t.Fatalf("settings: %+v", settings)
	}
	if _, err := LoadConfig(filepath.Join(t.TempDir(), "missing.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing file: %v", err)
	}
	for name, test := range map[string]struct {
		contents string
		want     string
	}{
		"malformed":       {`{"host":`, "invalid database settings"},
		"missing sslmode": {`{"host":"localhost","port":5432,"database":"easel","user":"easel"}`, "require host, port"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := LoadConfig(writeConfig(t, test.contents)); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}
