package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"easel/internal/accounts"
	"easel/internal/database"
	"easel/internal/database/dbtest"
	"easel/internal/games"
	"easel/internal/platform"
	"easel/internal/security"
	"easel/internal/session"
	"github.com/jackc/pgx/v5/pgxpool"
)

func writeTree(t *testing.T, root string, tree map[string]string) {
	t.Helper()
	for name, contents := range tree {
		target := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(contents), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

const siteManifest = `{"type":"application","name":"site","owner":"acme","host":"club","version":{"major":1,"minor":0,"revision":0},
 "server":{"security":{"entry":"security.mjs"},"application":{"entry":"main.mjs"},
  "data":[{".name":"Notice","text":{".type":"string",".default":""},"count":{".type":"integer",".default":0}}]}}`

const siteSecurity = `
const admin = { field: "principal.attributes.role", equals: "administrator" };
for (const action of ["create", "read", "modify", "remove"]) {
  Security.registerAction("acme.club.Notice", action);
  Security.registerPolicy("notice." + action, { resource: "acme.club.Notice", action, allow: action === "read" ? { always: true } : admin });
}
Security.registerAction("easel.easel.User", "automation.run");
Security.registerPolicy("automation.run", { resource: "easel.easel.User", action: "automation.run", allow: admin });
`

const siteMain = `
Server.auth.on("signIn", (signIn) => signIn.allow());
Server.auth.on("signUp", (signUp) => signUp.allow());
Application.events.register("notice.post", { valid: 2, text: "string" });
Application.events.register("notice.bump", { valid: 2, id: "string" });
Server.events.on("Load.Automation.Ready", () => Application.automations.define({
  name: "acme.club.Bump", parameters: ["notice"],
  steps: [
    { op: "load", type: "acme.club.Notice", id: { arg: "notice" }, as: "record" },
    { op: "delta", target: { path: ["record", "count"] }, value: 1 },
    { op: "save", record: "record" },
  ],
}));
Application.events.on("notice.post", ({ text }) => {
  Application.files.create({ name: "notice.txt", mediaType: "text/plain", text });
  const notice = new acme.club.Notice();
  notice.text = text;
  notice.save();
});
Application.events.on("notice.bump", ({ id }) => Application.automations.run("acme.club.Bump", [id]));
export function handleMessage(message) {
  if (message.op === "files") return Application.files.list().map((file) => ({ name: file.name, text: Application.files.readText(file.id), url: file.url }));
  return acme.club.Notice.ids().map((id) => { const notice = new acme.club.Notice(id); return { id, text: notice.text, count: notice.count }; });
}
`

func siteDefinition(t *testing.T) *platform.Definition {
	t.Helper()
	root := t.TempDir()
	writeTree(t, root, map[string]string{
		"server/server.json":        `{"startup":"./site/manifest.json"}`,
		"server/site/manifest.json": siteManifest,
		"server/site/security.mjs":  siteSecurity,
		"server/site/main.mjs":      siteMain,
	})
	definition, err := platform.Load(filepath.Join(root, "server"))
	if err != nil {
		t.Fatal(err)
	}
	return definition
}

func startSite(t *testing.T, pool *pgxpool.Pool, serverID, folder string, definition *platform.Definition) (*games.Manager, session.ServerRuntime) {
	t.Helper()
	manager := &games.Manager{Pool: pool, Catalog: &platform.Catalog{}, Folder: folder, ServerID: serverID}
	service := &accounts.Service{Pool: pool, ServerID: serverID}
	runtime, err := manager.StartServer(context.Background(), definition, games.ServerHost{Users: ScriptedUsersNotifying(service, manager.SyncServerPrincipal), AuthorizeClient: SignedInClient})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { runtime.Close(); manager.Close() })
	return manager, runtime
}

func TestServerDefinitionUsesRecordsSecurityAutomationsAndFiles(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	definition := siteDefinition(t)
	folder := t.TempDir()
	service := &accounts.Service{Pool: pool}
	ada, err := service.SignUp(ctx, "ada", "correct horse", "")
	if err != nil {
		t.Fatal(err)
	}
	bob, err := service.SignUp(ctx, "bob", "correct horse", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := service.SetAdmin(ctx, ada.ID, true); err != nil {
		t.Fatal(err)
	}
	manager, runtime := startSite(t, pool, "", folder, definition)
	for _, user := range []accounts.User{ada, bob} {
		if err := manager.SyncServerPrincipal(ctx, user.ID); err != nil {
			t.Fatal(err)
		}
	}
	as := func(user accounts.User) context.Context { return security.WithPrincipal(ctx, user.ID) }
	list := func(runtime session.ServerRuntime, op string) []map[string]any {
		t.Helper()
		data, err := runtime.Dispatch(ctx, json.RawMessage(`{"op":"`+op+`"}`))
		if err != nil {
			t.Fatal(err)
		}
		var found []map[string]any
		if err := json.Unmarshal(data, &found); err != nil {
			t.Fatal(err)
		}
		return found
	}
	if err := runtime.EmitAuthorizedClient(as(bob), "notice.post", json.RawMessage(`{"text":"spam"}`)); !errors.Is(err, security.ErrDenied) {
		t.Fatalf("a user without the role posted a notice: %v", err)
	}
	if notices, stored := list(runtime, "notices"), list(runtime, "files"); len(notices) != 0 || len(stored) != 0 {
		t.Fatalf("a denied request left data behind: %v %v", notices, stored)
	}
	if err := runtime.EmitAuthorizedClient(as(ada), "notice.post", json.RawMessage(`{"text":"Welcome"}`)); err != nil {
		t.Fatal(err)
	}
	notices := list(runtime, "notices")
	if len(notices) != 1 || notices[0]["text"] != "Welcome" {
		t.Fatalf("notices: %v", notices)
	}
	bump := json.RawMessage(`{"id":"` + notices[0]["id"].(string) + `"}`)
	if err := runtime.EmitAuthorizedClient(as(bob), "notice.bump", bump); !errors.Is(err, security.ErrDenied) {
		t.Fatalf("a user without the role ran the automation: %v", err)
	}
	if err := runtime.EmitAuthorizedClient(as(ada), "notice.bump", bump); err != nil {
		t.Fatal(err)
	}
	if err := service.SetAdmin(ctx, bob.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := manager.SyncServerPrincipal(ctx, bob.ID); err != nil {
		t.Fatal(err)
	}
	if err := runtime.EmitAuthorizedClient(as(bob), "notice.bump", bump); err != nil {
		t.Fatalf("a new administrator is authorized: %v", err)
	}
	if hosted, err := manager.List(ctx); err != nil || len(hosted) != 0 {
		t.Fatalf("server storage is listed as a game: %v %v", hosted, err)
	}
	runtime.Close()
	manager.Close()

	_, restarted := startSite(t, pool, "", folder, definition)
	notices = list(restarted, "notices")
	if len(notices) != 1 || notices[0]["text"] != "Welcome" || notices[0]["count"] != float64(2) {
		t.Fatalf("notices after restart: %v", notices)
	}
	stored := list(restarted, "files")
	if len(stored) != 1 || stored[0]["text"] != "Welcome" || !strings.HasPrefix(stored[0]["url"].(string), "/files/server/") {
		t.Fatalf("files after restart: %v", stored)
	}
	var revisions int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM game_data.contract_revisions r JOIN game_data.games g USING(game_id) WHERE g.kind='server'`).Scan(&revisions); err != nil || revisions != 1 {
		t.Fatalf("an unchanged server definition published %d revisions: %v", revisions, err)
	}

	other, err := database.EnsureServer(ctx, pool, "other")
	if err != nil {
		t.Fatal(err)
	}
	_, separate := startSite(t, pool, other, t.TempDir(), definition)
	if notices := list(separate, "notices"); len(notices) != 0 {
		t.Fatalf("another server reads this server's records: %v", notices)
	}
	if _, err := (&accounts.Service{Pool: pool, ServerID: other}).Login(ctx, "ada", "correct horse"); !errors.Is(err, accounts.ErrInvalidCredentials) {
		t.Fatalf("an account signed in to another server: %v", err)
	}
}

const filesManifest = `{"type":"application","name":"table","owner":"acme","host":"files","server":{"application":{"entry":"main.mjs"}}}`

const filesMain = `
Application.files.on("upload", (upload) => upload.mediaType === "image/png" ? upload.allow() : upload.refuse("Only PNG images."));
Application.files.on("uploaded", (file, user) => { globalThis.last = { id: file.id, user: user.id }; });
export function handleMessage(message) {
  if (message.op === "remove") { Application.files.remove(message.id); return true; }
  if (message.op === "last") return globalThis.last || null;
  return Application.files.list();
}
`

func TestGameFilesAreStoredProtectedAndCleanedUp(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	root := t.TempDir()
	writeTree(t, root, map[string]string{"applications/table/manifest.json": filesManifest, "applications/table/main.mjs": filesMain})
	catalog, err := platform.LoadCatalog(root)
	if err != nil {
		t.Fatal(err)
	}
	folder := t.TempDir()
	newManager := func() *games.Manager {
		manager := &games.Manager{Pool: pool, Catalog: catalog, Folder: folder, FileLimit: 4096}
		t.Cleanup(manager.Close)
		return manager
	}
	manager := newManager()
	service := &accounts.Service{Pool: pool}
	policy := hookedServer(t, allowEveryone)
	var router *ServerRouter
	serve := func(manager *games.Manager) *httptest.Server {
		router, err = NewServerRouter(manager, policy)
		if err != nil {
			t.Fatal(err)
		}
		site := httptest.NewUnstartedServer(nil)
		site.Config.Handler = NewHandler(Config{Accounts: service, Policy: policy, Router: router, PublicURL: "http://" + site.Listener.Addr().String()})
		site.Start()
		t.Cleanup(site.Close)
		return site
	}
	site := serve(manager)
	first, err := manager.Create(ctx, "First", "acme.files.table", nil, games.Open)
	if err != nil {
		t.Fatal(err)
	}
	second, err := manager.Create(ctx, "Second", "acme.files.table", nil, games.Open)
	if err != nil {
		t.Fatal(err)
	}
	for _, game := range []games.Game{first, second} {
		if err := manager.Start(ctx, game.ID); err != nil {
			t.Fatal(err)
		}
	}
	people := map[string]accounts.User{}
	clients := map[string]*client{}
	signUp := func(site *httptest.Server, name string) {
		user := newClient(t, site.URL)
		response, body := user.do("POST", "/api/accounts", `{"username":"`+name+`","password":"correct horse"}`, nil)
		if response.StatusCode != http.StatusCreated {
			t.Fatal(response.StatusCode, body)
		}
		people[name] = accounts.User{ID: body["user"].(map[string]any)["id"].(string), DisplayName: name}
		clients[name] = user
	}
	for _, name := range []string{"ada", "bob", "cyd"} {
		signUp(site, name)
	}
	for name, game := range map[string]games.Game{"ada": first, "cyd": first, "bob": second} {
		if err := manager.Join(ctx, game.ID, people[name]); err != nil {
			t.Fatal(err)
		}
	}
	send := func(site *httptest.Server, who, method, path, mediaType string, body []byte, header map[string]string) (*http.Response, []byte) {
		t.Helper()
		request, err := http.NewRequest(method, site.URL+path, bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		if mediaType != "" {
			request.Header.Set("Content-Type", mediaType)
		}
		request.Header.Set("Origin", site.URL)
		for key, value := range header {
			request.Header.Set(key, value)
		}
		for _, cookie := range clients[who].http.Jar.Cookies(request.URL) {
			request.AddCookie(cookie)
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		data, _ := io.ReadAll(response.Body)
		return response, data
	}
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{7}, 100)...)
	response, data := send(site, "ada", "POST", "/files/"+first.ID+"?name=portrait.png", "image/png", png, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("upload: %d %s", response.StatusCode, data)
	}
	var uploaded struct {
		File struct {
			ID, Name, URL, Hash, Owner string
			Size                       int64
		}
	}
	if err := json.Unmarshal(data, &uploaded); err != nil || uploaded.File.Size != int64(len(png)) || uploaded.File.Owner != people["ada"].ID || uploaded.File.URL != "/files/"+first.ID+"/"+uploaded.File.ID {
		t.Fatalf("uploaded file: %s %v", data, err)
	}
	runtime, _ := manager.Runtime(first.ID)
	if last, err := runtime.Dispatch(ctx, json.RawMessage(`{"op":"last"}`)); err != nil || !strings.Contains(string(last), uploaded.File.ID) || !strings.Contains(string(last), people["ada"].ID) {
		t.Fatalf("the application was not told about the upload: %s %v", last, err)
	}
	for name, attempt := range map[string]struct {
		who, path, mediaType string
		body                 []byte
		status               int
	}{
		"refused by the application": {"ada", "/files/" + first.ID + "?name=notes.txt", "text/plain", []byte("hello"), http.StatusForbidden},
		"contents do not match":      {"ada", "/files/" + first.ID + "?name=fake.png", "image/png", []byte("not an image at all"), http.StatusUnsupportedMediaType},
		"type is not allowed":        {"ada", "/files/" + first.ID + "?name=run.exe", "application/x-msdownload", png, http.StatusUnsupportedMediaType},
		"too large":                  {"ada", "/files/" + first.ID + "?name=big.png", "image/png", append(append([]byte(nil), png...), make([]byte, 5000)...), http.StatusRequestEntityTooLarge},
		"not a member":               {"bob", "/files/" + first.ID + "?name=portrait.png", "image/png", png, http.StatusNotFound},
		"bad name":                   {"ada", "/files/" + first.ID + "?name=..%2Fescape.png", "image/png", png, http.StatusBadRequest},
	} {
		if response, data := send(site, attempt.who, "POST", attempt.path, attempt.mediaType, attempt.body, nil); response.StatusCode != attempt.status {
			t.Fatalf("%s: %d %s", name, response.StatusCode, data)
		}
	}
	blobs := func() int {
		count := 0
		_ = filepath.WalkDir(filepath.Join(folder, first.ID, "files"), func(_ string, entry os.DirEntry, err error) error {
			if err == nil && !entry.IsDir() {
				count++
			}
			return nil
		})
		return count
	}
	if blobs() != 1 {
		t.Fatalf("refused uploads left %d files on disk", blobs())
	}
	response, data = send(site, "cyd", "GET", uploaded.File.URL, "", nil, nil)
	if response.StatusCode != http.StatusOK || !bytes.Equal(data, png) || response.Header.Get("Content-Type") != "image/png" || response.Header.Get("ETag") != `"`+uploaded.File.Hash+`"` || response.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("another member retrieves the file: %d %v", response.StatusCode, response.Header)
	}
	if response, _ := send(site, "cyd", "GET", uploaded.File.URL, "", nil, map[string]string{"If-None-Match": response.Header.Get("ETag")}); response.StatusCode != http.StatusNotModified {
		t.Fatalf("cache validation: %d", response.StatusCode)
	}
	for name, path := range map[string]string{"another game's member": uploaded.File.URL, "through another game": "/files/" + second.ID + "/" + uploaded.File.ID, "path escape": "/files/" + second.ID + "/..%2F" + first.ID} {
		if response, _ := send(site, "bob", "GET", path, "", nil, nil); response.StatusCode != http.StatusNotFound {
			t.Fatalf("%s: %d", name, response.StatusCode)
		}
	}
	if response, _ := http.Get(site.URL + uploaded.File.URL); response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous download: %d", response.StatusCode)
	}

	site.Close()
	manager.Close()
	manager = newManager()
	site = serve(manager)
	if err := manager.Start(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if response, data := send(site, "cyd", "GET", uploaded.File.URL, "", nil, nil); response.StatusCode != http.StatusOK || !bytes.Equal(data, png) {
		t.Fatalf("file after restart: %d", response.StatusCode)
	}
	replacement := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{9}, 50)...)
	if response, data := send(site, "ada", "PUT", uploaded.File.URL+"?name=portrait.png", "image/png", replacement, map[string]string{"If-Match": `"stale"`}); response.StatusCode != http.StatusPreconditionFailed {
		t.Fatalf("stale replacement: %d %s", response.StatusCode, data)
	}
	if response, data := send(site, "ada", "PUT", uploaded.File.URL+"?name=portrait.png", "image/png", replacement, map[string]string{"If-Match": `"` + uploaded.File.Hash + `"`}); response.StatusCode != http.StatusOK {
		t.Fatalf("replacement: %d %s", response.StatusCode, data)
	}
	if response, data := send(site, "cyd", "GET", uploaded.File.URL, "", nil, nil); response.StatusCode != http.StatusOK || !bytes.Equal(data, replacement) || blobs() != 1 {
		t.Fatalf("replaced file: %d, %d files on disk", response.StatusCode, blobs())
	}
	if err := os.WriteFile(filepath.Join(folder, first.ID, "files", "ab", "abandoned"), []byte("x"), 0o644); err == nil {
		t.Fatal("expected the folder to be missing")
	}
	if err := os.MkdirAll(filepath.Join(folder, first.ID, "files", "ab"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, first.ID, "files", "ab", "abandoned"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if removed, err := manager.Files(first.ID).Sweep(ctx); err != nil || removed != 1 || blobs() != 1 {
		t.Fatalf("orphan cleanup removed %d: %v", removed, err)
	}
	runtime, _ = manager.Runtime(first.ID)
	if _, err := runtime.Dispatch(ctx, json.RawMessage(`{"op":"remove","id":"`+uploaded.File.ID+`"}`)); err != nil {
		t.Fatal(err)
	}
	if response, _ := send(site, "cyd", "GET", uploaded.File.URL, "", nil, nil); response.StatusCode != http.StatusNotFound || blobs() != 0 {
		t.Fatalf("removed file: %d, %d files on disk", response.StatusCode, blobs())
	}
	if err := manager.Delete(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(folder, first.ID)); !os.IsNotExist(err) {
		t.Fatalf("deleted game folder remains: %v", err)
	}
}
