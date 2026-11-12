package platform

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for name, contents := range files {
		target := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(contents), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

const serverApp = `{"type":"application","name":"server","owner":"easel","host":"easel","server":{"application":{"entry":"application/main.mjs"}}}`
const coreLibrary = `{"type":"module","name":"core","owner":"easel","host":"easel","server":{"library":{"entry":"library.mjs"}}}`

func TestLoadDefinition(t *testing.T) {
	root := t.TempDir()
	write(t, root, map[string]string{
		"server.json":                `{"startup":"./easel/manifest.json","library":[{"name":"core","manifest":"./library/core/manifest.json"}]}`,
		"easel/manifest.json":        serverApp,
		"easel/application/main.mjs": ``,
		"library/core/manifest.json": coreLibrary,
		"library/core/library.mjs":   ``,
	})
	definition, err := Load(root)
	if err != nil {
		t.Fatal(err)
	}
	if definition.Server.ID() != "easel.easel.server" || len(definition.Libraries) != 1 || definition.Libraries[0].ID() != "easel.easel.core" {
		t.Fatalf("definition: %+v", definition)
	}
	for name, test := range map[string]struct {
		files map[string]string
		want  string
	}{
		"missing startup":     {map[string]string{"server.json": `{"library":[]}`}, "requires startup"},
		"unknown key":         {map[string]string{"server.json": `{"startup":"./easel/manifest.json","extra":1}`}, "unknown field"},
		"startup not app":     {map[string]string{"server.json": `{"startup":"./library/core/manifest.json"}`}, "must be an application"},
		"wrong library name":  {map[string]string{"server.json": `{"startup":"./easel/manifest.json","library":[{"name":"other","manifest":"./library/core/manifest.json"}]}`}, "manifest is named core"},
		"application library": {map[string]string{"server.json": `{"startup":"./easel/manifest.json","library":[{"name":"server","manifest":"./easel/manifest.json"}]}`}, "cannot be an application"},
		"escaping path":       {map[string]string{"server.json": `{"startup":"../outside/manifest.json"}`}, "inside the package"},
		"not a manifest":      {map[string]string{"server.json": `{"startup":"./easel/application/main.mjs"}`}, "must name a manifest.json"},
	} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			write(t, dir, map[string]string{"easel/manifest.json": serverApp, "easel/application/main.mjs": ``, "library/core/manifest.json": coreLibrary, "library/core/library.mjs": ``})
			write(t, dir, test.files)
			if _, err := Load(dir); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

func TestCatalog(t *testing.T) {
	root := t.TempDir()
	write(t, root, map[string]string{
		"applications/demo/manifest.json": `{"type":"application","name":"demo","owner":"easel","host":"easel","server":{"application":{"entry":"main.mjs"}}}`,
		"applications/demo/main.mjs":      ``,
		"modules/ui/manifest.json":        `{"type":"module","name":"ui","owner":"easel","host":"easel","server":{"library":{"entry":"ui.mjs"}}}`,
		"modules/ui/ui.mjs":               ``,
	})
	catalog, err := LoadCatalog(root)
	if err != nil {
		t.Fatal(err)
	}
	packages, err := catalog.Packages("easel.easel.demo", []string{"easel.easel.ui", "easel.easel.ui"})
	if err != nil || len(packages) != 2 || packages[1].ID() != "easel.easel.ui" {
		t.Fatalf("packages: %v %v", packages, err)
	}
	if _, err := catalog.Packages("easel.easel.missing", nil); err == nil || !strings.Contains(err.Error(), "not installed") {
		t.Fatalf("missing application: %v", err)
	}
	if _, err := catalog.Packages("easel.easel.demo", []string{"easel.easel.missing"}); err == nil || !strings.Contains(err.Error(), "module easel.easel.missing is not installed") {
		t.Fatalf("missing module: %v", err)
	}
	misplaced := t.TempDir()
	write(t, misplaced, map[string]string{"modules/demo/manifest.json": `{"type":"application","name":"demo","owner":"easel","host":"easel","server":{"application":{"entry":"main.mjs"}}}`, "modules/demo/main.mjs": ``})
	if _, err := LoadCatalog(misplaced); err == nil || !strings.Contains(err.Error(), "is in modules but is an application") {
		t.Fatalf("misplaced application: %v", err)
	}
}

func TestRepositoryServerDefinition(t *testing.T) {
	definition, err := Load(filepath.Join("..", "..", "server", "easel", "server"))
	if err != nil {
		t.Fatal(err)
	}
	if definition.Server.ID() != "easel.easel.server" || len(definition.Libraries) != 30 || definition.Libraries[0].ID() != "easel.easel.core" {
		t.Fatalf("repository definition: %s %v", definition.Server.ID(), definition.Libraries)
	}
	if _, err := LoadCatalog(filepath.Join("..", "..", "server", "easel")); err != nil {
		t.Fatal(err)
	}
}
