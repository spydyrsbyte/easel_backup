package hosting

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
	"easel/internal/games"
)

const easelDir = "../../server/easel"

type site struct {
	t      *testing.T
	server *Server
	web    *httptest.Server
	client *http.Client
}

func launch(t *testing.T, shared Shared, name string) (*site, error) {
	t.Helper()
	web := httptest.NewUnstartedServer(nil)
	hosted, err := Start(context.Background(), shared, ServerConfig{Name: name, Addr: web.Listener.Addr().String()})
	if err != nil {
		web.Close()
		return nil, err
	}
	web.Config.Handler = hosted.Handler
	web.Start()
	jar, _ := cookiejar.New(nil)
	s := &site{t: t, server: hosted, web: web, client: &http.Client{Jar: jar}}
	t.Cleanup(s.close)
	return s, nil
}

func (s *site) close() {
	if s.web != nil {
		s.web.Close()
		s.server.Close()
		s.web = nil
	}
}

func (s *site) post(path, body string) (int, map[string]any) {
	s.t.Helper()
	request, err := http.NewRequest("POST", s.web.URL+path, strings.NewReader(body))
	if err != nil {
		s.t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", s.web.URL)
	response, err := s.client.Do(request)
	if err != nil {
		s.t.Fatal(err)
	}
	defer response.Body.Close()
	decoded := map[string]any{}
	_ = json.NewDecoder(response.Body).Decode(&decoded)
	return response.StatusCode, decoded
}

func TestLogicalServersShareNothing(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	shared := Shared{Pool: pool, EaselDir: easelDir, GamesDir: t.TempDir(), Slots: &games.Slots{}}
	alpha, err := launch(t, shared, "alpha")
	if err != nil {
		t.Fatal(err)
	}
	beta, err := launch(t, shared, "beta")
	if err != nil {
		t.Fatal(err)
	}
	if alpha.server.ID == beta.server.ID || alpha.server.Manager.ServerStorage() == beta.server.Manager.ServerStorage() {
		t.Fatal("two servers share an identity or their application storage")
	}
	if _, err := Start(ctx, shared, ServerConfig{Name: "alpha", Addr: "127.0.0.1:0"}); err == nil || !strings.Contains(err.Error(), "already running this server") {
		t.Fatalf("the same server started twice on one database: %v", err)
	}

	status, body := alpha.post("/api/accounts", `{"username":"ada","password":"correct horse"}`)
	if status != http.StatusCreated {
		t.Fatal(status, body)
	}
	alphaAda := body["user"].(map[string]any)["id"].(string)
	if status, _ := beta.post("/api/sessions", `{"username":"ada","password":"correct horse"}`); status != http.StatusUnauthorized {
		t.Fatalf("an account of one server signed in to another: %d", status)
	}
	status, body = beta.post("/api/accounts", `{"username":"ada","password":"another horse"}`)
	if status != http.StatusCreated {
		t.Fatalf("the same username is not free on another server: %d %v", status, body)
	}
	betaAda := body["user"].(map[string]any)["id"].(string)
	if alphaAda == betaAda {
		t.Fatal("two servers share an account")
	}
	var token string
	for _, cookie := range alpha.client.Jar.Cookies(mustURL(t, alpha.web.URL)) {
		if cookie.Name != "easel_session_alpha" {
			t.Fatalf("unexpected session cookie %s", cookie.Name)
		}
		token = cookie.Value
	}
	for _, name := range []string{"easel_session_beta", "easel_session_alpha", "easel_session"} {
		request, _ := http.NewRequest("GET", beta.web.URL+"/api/me", nil)
		request.AddCookie(&http.Cookie{Name: name, Value: token})
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusUnauthorized {
			t.Fatalf("a session of one server was accepted by another as %s: %d", name, response.StatusCode)
		}
	}

	alphaGames, err := alpha.server.Manager.List(ctx)
	if err != nil || len(alphaGames) != 1 || !alphaGames[0].Running {
		t.Fatalf("alpha games: %+v %v", alphaGames, err)
	}
	betaGames, err := beta.server.Manager.List(ctx)
	if err != nil || len(betaGames) != 1 || betaGames[0].ID == alphaGames[0].ID || !betaGames[0].Running {
		t.Fatalf("beta games: %+v %v", betaGames, err)
	}
	if _, err := alpha.server.Manager.Get(ctx, betaGames[0].ID); !errors.Is(err, games.ErrUnknownGame) {
		t.Fatalf("a server read another server's game: %v", err)
	}
	if err := alpha.server.Manager.Start(ctx, betaGames[0].ID); !errors.Is(err, games.ErrUnknownGame) {
		t.Fatalf("a server started another server's game: %v", err)
	}
	if err := alpha.server.Manager.Join(ctx, betaGames[0].ID, accounts.User{ID: alphaAda}); !errors.Is(err, games.ErrUnknownGame) {
		t.Fatalf("an account joined another server's game: %v", err)
	}
	if err := beta.server.Manager.AddMember(ctx, betaGames[0].ID, alphaAda); !errors.Is(err, games.ErrUnknownUser) {
		t.Fatalf("a server added another server's account to its game: %v", err)
	}
	if err := alpha.server.Accounts.SetAdmin(ctx, alphaAda, true); err != nil {
		t.Fatal(err)
	}
	if admins, err := beta.server.Accounts.Admins(ctx); err != nil || len(admins) != 0 {
		t.Fatalf("administrators leaked between servers: %v %v", admins, err)
	}
	if err := beta.server.Accounts.SetAdmin(ctx, alphaAda, true); !errors.Is(err, accounts.ErrNoAccount) {
		t.Fatalf("a server administered another server's account: %v", err)
	}
	if err := alpha.server.Manager.Suspend(ctx, alphaGames[0].ID); err != nil {
		t.Fatal(err)
	}

	alpha.close()
	beta.close()
	alpha, err = launch(t, shared, "alpha")
	if err != nil {
		t.Fatal(err)
	}
	beta, err = launch(t, shared, "beta")
	if err != nil {
		t.Fatal(err)
	}
	again, err := alpha.server.Manager.List(ctx)
	if err != nil || len(again) != 1 || again[0].ID != alphaGames[0].ID || again[0].Running || again[0].Lifecycle != games.Suspended {
		t.Fatalf("alpha after restart: %+v %v", again, err)
	}
	again, err = beta.server.Manager.List(ctx)
	if err != nil || len(again) != 1 || again[0].ID != betaGames[0].ID || !again[0].Running {
		t.Fatalf("beta after restart: %+v %v", again, err)
	}
	if status, _ := alpha.post("/api/sessions", `{"username":"ada","password":"correct horse"}`); status != http.StatusOK {
		t.Fatalf("sign in after restart: %d", status)
	}
}

func mustURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	request, err := http.NewRequest("GET", raw, nil)
	if err != nil {
		t.Fatal(err)
	}
	return request.URL
}

func TestOneGameEditionLimitsEveryServerInTheProcess(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	shared := Shared{Pool: pool, EaselDir: easelDir, GamesDir: t.TempDir(), Slots: &games.Slots{Max: 1}}
	alpha, err := launch(t, shared, "alpha")
	if err != nil {
		t.Fatal(err)
	}
	beta, err := launch(t, shared, "beta")
	if err != nil {
		t.Fatal(err)
	}
	if len(alpha.server.Manager.Running()) != 1 || len(beta.server.Manager.Running()) != 0 {
		t.Fatalf("running games: %d and %d", len(alpha.server.Manager.Running()), len(beta.server.Manager.Running()))
	}
	listed, err := beta.server.Manager.List(ctx)
	if err != nil || len(listed) != 1 {
		t.Fatal(listed, err)
	}
	var limit *games.LimitError
	if err := beta.server.Manager.Start(ctx, listed[0].ID); !errors.As(err, &limit) || !strings.Contains(err.Error(), "Demo table") {
		t.Fatalf("the limit did not hold across servers: %v", err)
	}
	for id := range alpha.server.Manager.Running() {
		if err := alpha.server.Manager.Suspend(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	if err := beta.server.Manager.Start(ctx, listed[0].ID); err != nil {
		t.Fatal(err)
	}
}

func TestServersFile(t *testing.T) {
	directory := t.TempDir()
	servers, err := LoadServers(directory, "127.0.0.1:5000", "auth.json")
	if err != nil || len(servers) != 1 || servers[0].Name != "default" || servers[0].Addr != "127.0.0.1:5000" {
		t.Fatalf("default server: %+v %v", servers, err)
	}
	write := func(contents string) {
		if err := os.WriteFile(filepath.Join(directory, ServersFile), []byte(contents), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(`{"servers":[{"name":"club","addr":":5000","auth":"club-auth.json"},{"name":"shop","addr":":5001","startup":"./test/manifest.json","public_url":"https://shop.example"}]}`)
	servers, err = LoadServers(directory, "", "")
	if err != nil || len(servers) != 2 || servers[0].Auth != filepath.Join(directory, "club-auth.json") || servers[1].Startup != "./test/manifest.json" {
		t.Fatalf("servers: %+v %v", servers, err)
	}
	for name, contents := range map[string]string{
		"duplicate name":    `{"servers":[{"name":"a","addr":":1"},{"name":"a","addr":":2"}]}`,
		"duplicate address": `{"servers":[{"name":"a","addr":":1"},{"name":"b","addr":":1"}]}`,
		"bad name":          `{"servers":[{"name":"Not Valid","addr":":1"}]}`,
		"no address":        `{"servers":[{"name":"a"}]}`,
		"empty":             `{"servers":[]}`,
		"unknown field":     `{"servers":[{"name":"a","addr":":1","port":5}]}`,
	} {
		write(contents)
		if _, err := LoadServers(directory, "", ""); err == nil {
			t.Fatalf("%s was accepted", name)
		}
	}
}
