package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
	"easel/internal/jsapi"
	"easel/internal/platform"
	"easel/internal/session"
	"github.com/gorilla/websocket"
)

func serverApplication(t *testing.T, dir string, games jsapi.ServerGames, users jsapi.ServerUsers) session.ServerRuntime {
	t.Helper()
	definition, err := platform.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	runtime, err := session.NewGame(context.Background(), session.Game{GameID: "server", SessionID: "server", Server: true, Games: games, Users: users, Packages: definition.Packages(), Globals: definition.Libraries, AuthorizeClient: SignedInClient})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { runtime.Close() })
	return runtime.(session.ServerRuntime)
}

func hookedServer(t *testing.T, source string) session.ServerRuntime {
	t.Helper()
	dir := t.TempDir()
	for name, contents := range map[string]string{
		"server.json":                `{"startup":"./easel/manifest.json"}`,
		"easel/manifest.json":        `{"type":"application","name":"server","owner":"easel","host":"easel","server":{"application":{"entry":"application/main.mjs"}}}`,
		"easel/application/main.mjs": source,
	} {
		target := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(contents), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return serverApplication(t, dir, nil, nil)
}

const invitingServer = `
Server.auth.on("signUp", (signUp) => signUp.challenge("invite"));
Server.auth.on("response", (response) => response.hook === "signUp" && response.challengeName === "invite" && response.value === "letmein" ? response.allow() : response.refuse("Invalid invite."));
Server.auth.on("signIn", (signIn) => signIn.user.displayName === "Banned" ? signIn.refuse("This account is banned.") : undefined);
Server.auth.on("signIn", (signIn) => signIn.allow());
Server.auth.on("signedIn", (signedIn) => signedIn.client === "android" ? signedIn.refuse("Not on android.") : undefined);
`

func TestSignInHooks(t *testing.T) {
	pool := dbtest.Open(t)
	policy := hookedServer(t, invitingServer)
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{Accounts: &accounts.Service{Pool: pool}, Policy: policy, PublicURL: "http://" + site.Listener.Addr().String()})
	site.Start()
	defer site.Close()
	ada := newClient(t, site.URL)
	signUp := func(c *client, body string) string {
		t.Helper()
		response, reply := c.do("POST", "/api/accounts", body, nil)
		if response.StatusCode != http.StatusAccepted || reply["challenge"] != "invite" || reply["challengeToken"] == "" {
			t.Fatalf("sign up: %d %v", response.StatusCode, reply)
		}
		return reply["challengeToken"].(string)
	}
	challengeToken := signUp(ada, `{"username":"ada","password":"correct horse"}`)
	if response, reply := ada.do("POST", "/api/sessions/response", `{"challengeToken":"`+challengeToken+`","response":"wrong"}`, nil); response.StatusCode != http.StatusForbidden || reply["error"] != "Invalid invite." {
		t.Fatalf("wrong invite: %d %v", response.StatusCode, reply)
	}
	if response, _ := ada.do("POST", "/api/sessions/response", `{"challengeToken":"`+challengeToken+`","response":"letmein"}`, nil); response.StatusCode != http.StatusBadRequest {
		t.Fatalf("challenge reused: %d", response.StatusCode)
	}
	if response, _ := ada.do("GET", "/api/me", "", nil); response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("refused sign-up signed in: %d", response.StatusCode)
	}
	challengeToken = signUp(ada, `{"username":"ada","password":"correct horse"}`)
	if response, reply := ada.do("POST", "/api/sessions/response", `{"challengeToken":"`+challengeToken+`","response":"letmein"}`, nil); response.StatusCode != http.StatusOK || reply["user"] == nil {
		t.Fatalf("invited sign-up: %d %v", response.StatusCode, reply)
	}
	if response, _ := ada.do("GET", "/api/me", "", nil); response.StatusCode != http.StatusOK {
		t.Fatalf("invited user not signed in: %d", response.StatusCode)
	}
	banned := newClient(t, site.URL)
	challengeToken = signUp(banned, `{"username":"banned","password":"correct horse","displayName":"Banned"}`)
	banned.do("POST", "/api/sessions/response", `{"challengeToken":"`+challengeToken+`","response":"letmein"}`, nil)
	if response, reply := banned.do("POST", "/api/sessions", `{"username":"banned","password":"correct horse"}`, nil); response.StatusCode != http.StatusForbidden || reply["error"] != "This account is banned." {
		t.Fatalf("banned sign-in: %d %v", response.StatusCode, reply)
	}
	if response, _ := newClient(t, site.URL).do("POST", "/api/sessions", `{"username":"ada","password":"correct horse"}`, nil); response.StatusCode != http.StatusOK {
		t.Fatalf("sign-in: %d", response.StatusCode)
	}
	authenticator := &Authenticator{Accounts: &accounts.Service{Pool: pool}, Logins: &accounts.Limiter{Max: 10, Window: time.Minute}, Policy: policy}
	result, err := authenticator.SignIn(context.Background(), SignIn{Method: "password", Username: "ada", Password: "correct horse", Client: "android"})
	if err != nil || result.Refused != "Not on android." || result.Token != "" {
		t.Fatalf("signedIn refusal: %+v %v", result, err)
	}
	if result, err := (&Authenticator{Accounts: &accounts.Service{Pool: pool}, Logins: &accounts.Limiter{Max: 10, Window: time.Minute}}).SignIn(context.Background(), SignIn{Method: "password", Username: "ada", Password: "correct horse"}); err != nil || result.Refused == "" {
		t.Fatalf("no server application allowed sign-in: %+v %v", result, err)
	}
}

func TestSignInOverProtocol(t *testing.T) {
	pool := dbtest.Open(t)
	g, err := NewDemoGame(context.Background(), "../../server/easel", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Runtime.Close()
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: &accounts.Service{Pool: pool}, Policy: hookedServer(t, invitingServer), Router: SingleGame(g), PublicURL: "http://" + site.Listener.Addr().String()})
	site.Start()
	defer site.Close()
	dial := func() *websocket.Conn {
		t.Helper()
		c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(site.URL, "http")+"/client/http", http.Header{"Origin": {site.URL}})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { c.Close() })
		c.SetReadDeadline(time.Now().Add(5 * time.Second))
		return c
	}
	read := func(c *websocket.Conn) map[string]any {
		t.Helper()
		var f map[string]any
		if err := c.ReadJSON(&f); err != nil {
			t.Fatal(err)
		}
		return f
	}
	hello := map[string]any{"type": "hello", "id": "h", "protocol": protocolVersion{1, 0}}
	c := dial()
	c.WriteJSON(hello)
	if f := read(c); f["type"] != "auth.required" || f["replyTo"] != "h" {
		t.Fatal(f)
	}
	c.WriteJSON(map[string]any{"type": "ready", "id": "r"})
	if f := read(c); f["code"] != "auth.required" {
		t.Fatal(f)
	}
	c = dial()
	c.WriteJSON(hello)
	read(c)
	c.WriteJSON(map[string]any{"type": "auth.signup", "id": "s", "payload": map[string]any{"username": "grace", "password": "correct horse", "displayName": "Grace"}})
	if f := read(c); f["type"] != "auth.challenge" || f["challenge"] != "invite" || f["replyTo"] != "s" {
		t.Fatal(f)
	}
	c.WriteJSON(map[string]any{"type": "auth.response", "id": "a", "payload": map[string]any{"response": "letmein"}})
	session := read(c)
	token, _ := session["token"].(string)
	if session["type"] != "auth.session" || session["replyTo"] != "a" || token == "" || session["user"].(map[string]any)["displayName"] != "Grace" {
		t.Fatal(session)
	}
	if f := read(c); f["type"] != "welcome" || f["replyTo"] != "h" {
		t.Fatal(f)
	}
	c.WriteJSON(map[string]any{"type": "ready", "id": "r"})
	if f := read(c); f["type"] != "ready.ok" {
		t.Fatal(f)
	}
	c = dial()
	c.WriteJSON(hello)
	read(c)
	c.WriteJSON(map[string]any{"type": "auth.signin", "id": "i", "payload": map[string]any{"method": "password", "username": "grace", "password": "wrong password"}})
	if f := read(c); f["type"] != "auth.refused" || f["reason"] != accounts.ErrInvalidCredentials.Error() {
		t.Fatal(f)
	}
	c.WriteJSON(map[string]any{"type": "auth.signin", "id": "i2", "payload": map[string]any{"method": "password", "username": "grace", "password": "correct horse"}})
	if f := read(c); f["type"] != "auth.session" {
		t.Fatal(f)
	}
	if f := read(c); f["type"] != "welcome" {
		t.Fatal(f)
	}
	resumed := dial()
	resumed.WriteJSON(map[string]any{"type": "hello", "id": "h", "protocol": protocolVersion{1, 0}, "token": token})
	if f := read(resumed); f["type"] != "welcome" {
		t.Fatal(f)
	}
	resumed.WriteJSON(map[string]any{"type": "auth.signout", "id": "o"})
	if _, _, err := resumed.ReadMessage(); err == nil {
		t.Fatal("connection remained open after sign-out")
	}
	revoked := dial()
	revoked.WriteJSON(map[string]any{"type": "hello", "id": "h", "protocol": protocolVersion{1, 0}, "token": token})
	if f := read(revoked); f["type"] != "auth.required" {
		t.Fatal(f)
	}
}

const allowEveryone = `
Server.auth.on("signIn", (signIn) => signIn.allow());
Server.auth.on("signUp", (signUp) => signUp.allow());
`
