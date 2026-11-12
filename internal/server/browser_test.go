package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"easel/internal/accounts"
	"easel/internal/manifest"
)

func TestBrowserFilesReloadFromDisk(t *testing.T) {
	directory := t.TempDir()
	for _, file := range []string{"templates/index.html", "templates/css/style.css", "modules/loader.mjs", "modules/runtime.mjs"} {
		data, err := os.ReadFile(filepath.Join("../../server/easel", file))
		if err != nil {
			t.Fatal(err)
		}
		target := filepath.Join(directory, file)
		if err = os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(target, data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	handler := NewHandler(Config{Accounts: &accounts.Service{}, FrontendDir: directory})
	get := func(url, etag string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(http.MethodGet, url, nil)
		if etag != "" {
			r.Header.Set("If-None-Match", etag)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	for _, route := range []struct{ url, file, media string }{
		{"/", "templates/index.html", "text/html"},
		{"/runtime/style.css", "templates/css/style.css", "text/css"},
		{"/runtime/loader.mjs", "modules/loader.mjs", "text/javascript"},
		{"/runtime/runtime.mjs", "modules/runtime.mjs", "text/javascript"},
	} {
		w := get(route.url, "")
		data, err := os.ReadFile(filepath.Join(directory, route.file))
		if err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || w.Body.String() != string(data) || !strings.HasPrefix(w.Header().Get("Content-Type"), route.media) {
			t.Fatalf("%s: %d %s", route.url, w.Code, w.Header())
		}
	}
	original := get("/runtime/style.css", "")
	updated := "body { background: #181818; color: #eeeeee; }\n"
	if err := os.WriteFile(filepath.Join(directory, "templates/css/style.css"), []byte(updated), 0644); err != nil {
		t.Fatal(err)
	}
	w := get("/runtime/style.css", original.Header().Get("ETag"))
	if w.Code != 200 || w.Body.String() != updated || w.Header().Get("ETag") == original.Header().Get("ETag") {
		t.Fatal("CSS change was not served by the existing handler")
	}
	if w.Header().Get("Cache-Control") != "no-cache" {
		t.Fatal("CSS must revalidate")
	}
	if cached := get("/runtime/style.css", w.Header().Get("ETag")); cached.Code != 304 {
		t.Fatal("unchanged CSS did not validate", cached.Code)
	}
	for _, url := range []string{"/runtime/manifest.json", "/runtime/css", "/templates/", "/modules/ui/manifest.json", "/config/database.json"} {
		if w := get(url, ""); w.Code != 404 {
			t.Fatalf("unexpected resource exposure: %s %d", url, w.Code)
		}
	}
}

func TestShellPackageAvailableBeforeSignIn(t *testing.T) {
	handler := NewHandler(Config{Accounts: &accounts.Service{}, FrontendDir: "../../server/easel"})
	get := func(url string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, url, nil))
		return w
	}
	page := get("/")
	body := strings.Split(strings.Split(page.Body.String(), "<body>")[1], "</body>")[0]
	if strings.TrimSpace(body) != `<div id="easel-root"></div>` {
		t.Fatal("entry page contains visible UI", body)
	}
	response := get("/runtime/shell.json")
	if response.Code != http.StatusOK {
		t.Fatal(response.Code, response.Body.String())
	}
	var plan manifest.Delivery
	if err := json.Unmarshal(response.Body.Bytes(), &plan); err != nil {
		t.Fatal(err)
	}
	if len(plan.Packages) != 1 || len(plan.Library) != 0 || len(plan.Packages[0].Interfaces) != 9 {
		t.Fatal("incomplete shell plan", plan)
	}
	pkg := plan.Packages[0]
	if strings.Contains(response.Body.String(), "server/") {
		t.Fatal("shell plan exposes server paths")
	}
	for _, definition := range pkg.Interfaces {
		resource := get(definition.URL)
		if resource.Code != http.StatusOK || !strings.Contains(resource.Body.String(), `"component"`) {
			t.Fatal("shell contract unavailable", definition.Name, resource.Code)
		}
	}
	for _, definition := range pkg.Interfaces {
		implementation := get(definition.Implementation)
		if implementation.Code != http.StatusOK || !strings.Contains(implementation.Body.String(), "export default class") {
			t.Fatal("shell implementation unavailable", definition.Name, implementation.Code)
		}
	}
	if helpers := get(pkg.BaseURL + "client/dom.mjs"); helpers.Code != http.StatusOK {
		t.Fatal("shell helpers unavailable", helpers.Code)
	}
	for _, file := range []string{"manifest.json", "server/application.mjs", "../ui/manifest.json"} {
		if resource := get(pkg.BaseURL + file); resource.Code == http.StatusOK {
			t.Fatal("undeclared public resource", file)
		}
	}
	if session := get("/runtime/session.mjs"); session.Code != http.StatusOK {
		t.Fatal("session controller unavailable")
	}
}
