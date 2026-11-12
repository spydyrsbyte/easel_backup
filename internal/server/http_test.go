package server

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
)

type fakeProvider struct {
	server  *httptest.Server
	subject string
	name    string
}

func newFakeProvider(t *testing.T) *fakeProvider {
	t.Helper()
	fake := &fakeProvider{subject: "42", name: "Ada"}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil || r.Form.Get("code") != "good-code" || r.Form.Get("code_verifier") == "" {
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"provider-token","token_type":"Bearer"}`))
	})
	mux.HandleFunc("GET /me", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer provider-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": fake.subject, "username": fake.name})
	})
	fake.server = httptest.NewServer(mux)
	t.Cleanup(fake.server.Close)
	return fake
}

type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func (c *client) do(method, path, body string, header map[string]string) (*http.Response, map[string]any) {
	c.t.Helper()
	request, err := http.NewRequest(method, c.base+path, strings.NewReader(body))
	if err != nil {
		c.t.Fatal(err)
	}
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	for key, value := range header {
		request.Header.Set(key, value)
	}
	response, err := c.http.Do(request)
	if err != nil {
		c.t.Fatal(err)
	}
	defer response.Body.Close()
	decoded := map[string]any{}
	_ = json.NewDecoder(response.Body).Decode(&decoded)
	return response, decoded
}

func newClient(t *testing.T, base string) *client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &client{t: t, base: base, http: &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func TestAccountsAndSignIn(t *testing.T) {
	pool := dbtest.Open(t)
	policy := hookedServer(t, allowEveryone)
	fake := newFakeProvider(t)
	var site *httptest.Server
	config := accounts.Config{Providers: map[string]accounts.ProviderConfig{
		"discord": {ClientID: "id", ClientSecret: "secret", AuthURL: fake.server.URL + "/authorize", TokenURL: fake.server.URL + "/token", UserInfoURL: fake.server.URL + "/me"},
	}}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	site = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { handler.ServeHTTP(w, r) }))
	t.Cleanup(site.Close)
	config.PublicURL = site.URL
	providers, err := config.Build()
	if err != nil {
		t.Fatal(err)
	}
	handler = NewHandler(Config{Accounts: &accounts.Service{Pool: pool}, Policy: policy, Providers: providers, PublicURL: site.URL, Logins: &accounts.Limiter{Max: 3, Window: time.Minute}}).ServeHTTP

	ada := newClient(t, site.URL)
	response, body := ada.do("POST", "/api/accounts", `{"username":"ada","password":"correct horse","displayName":"Ada L"}`, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("sign up: %d %v", response.StatusCode, body)
	}
	adaID := body["user"].(map[string]any)["id"].(string)
	cookie := response.Header.Get("Set-Cookie")
	if !strings.Contains(cookie, "HttpOnly") || !strings.Contains(cookie, "SameSite=Lax") {
		t.Fatalf("session cookie flags: %s", cookie)
	}
	if response, body := ada.do("GET", "/api/me", "", nil); response.StatusCode != http.StatusOK || body["user"].(map[string]any)["displayName"] != "Ada L" {
		t.Fatalf("me: %d %v", response.StatusCode, body)
	}

	stranger := newClient(t, site.URL)
	for name, test := range map[string]struct {
		method, path, body string
		header             map[string]string
		status             int
		message            string
	}{
		"duplicate":       {"POST", "/api/accounts", `{"username":"ADA","password":"another one"}`, nil, http.StatusConflict, "already taken"},
		"weak":            {"POST", "/api/accounts", `{"username":"bob","password":"short"}`, nil, http.StatusBadRequest, "at least 8"},
		"bad name":        {"POST", "/api/accounts", `{"username":"no spaces","password":"long enough"}`, nil, http.StatusBadRequest, "username must be"},
		"unknown key":     {"POST", "/api/accounts", `{"username":"bob","password":"long enough","admin":true}`, nil, http.StatusBadRequest, "invalid request body"},
		"form post":       {"POST", "/api/sessions", "username=ada", map[string]string{"Content-Type": "application/x-www-form-urlencoded"}, http.StatusUnsupportedMediaType, "application/json"},
		"cross site":      {"POST", "/api/sessions", `{"username":"ada","password":"correct horse"}`, map[string]string{"Origin": "https://evil.example"}, http.StatusForbidden, "cross-site"},
		"no session":      {"GET", "/api/me", "", nil, http.StatusUnauthorized, "not signed in"},
		"bad provider":    {"GET", "/auth/nope/start", "", nil, http.StatusNotFound, "unknown"},
		"bad state":       {"GET", "/auth/discord/callback?state=forged&code=good-code", "", nil, http.StatusBadRequest, "expired or is invalid"},
		"link signed out": {"GET", "/auth/discord/start?link=1", "", nil, http.StatusUnauthorized, "sign in before linking"},
	} {
		t.Run(name, func(t *testing.T) {
			response, body := stranger.do(test.method, test.path, test.body, test.header)
			if response.StatusCode != test.status || !strings.Contains(body["error"].(string), test.message) {
				t.Fatalf("got %d %v, want %d %q", response.StatusCode, body, test.status, test.message)
			}
		})
	}

	for attempt := 0; attempt < 3; attempt++ {
		if response, _ := stranger.do("POST", "/api/sessions", `{"username":"ada","password":"wrong password"}`, nil); response.StatusCode != http.StatusUnauthorized {
			t.Fatalf("wrong password %d: %d", attempt, response.StatusCode)
		}
	}
	if response, _ := stranger.do("POST", "/api/sessions", `{"username":"ada","password":"correct horse"}`, nil); response.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("rate limit: %d", response.StatusCode)
	}

	again := newClient(t, site.URL)
	again.base = site.URL
	unlimited := NewHandler(Config{Accounts: &accounts.Service{Pool: pool}, Policy: policy, Providers: providers, PublicURL: site.URL})
	handler = unlimited.ServeHTTP
	if response, _ := again.do("POST", "/api/sessions", `{"username":"Ada","password":"correct horse"}`, nil); response.StatusCode != http.StatusOK {
		t.Fatalf("login is case-insensitive: %d", response.StatusCode)
	}
	if response, _ := again.do("DELETE", "/api/sessions", "", nil); response.StatusCode != http.StatusNoContent {
		t.Fatalf("logout: %d", response.StatusCode)
	}
	if response, _ := again.do("GET", "/api/me", "", nil); response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("session survived logout: %d", response.StatusCode)
	}

	signIn := func(c *client, path string) (*http.Response, map[string]any) {
		t.Helper()
		response, _ := c.do("GET", path, "", nil)
		if response.StatusCode != http.StatusFound {
			t.Fatalf("start: %d", response.StatusCode)
		}
		location, err := url.Parse(response.Header.Get("Location"))
		if err != nil || !strings.HasPrefix(location.String(), fake.server.URL+"/authorize") || location.Query().Get("code_challenge_method") != "S256" {
			t.Fatalf("authorize redirect: %v %v", location, err)
		}
		return c.do("GET", "/auth/discord/callback?code=good-code&state="+url.QueryEscape(location.Query().Get("state")), "", nil)
	}
	newcomer := newClient(t, site.URL)
	if response, _ := signIn(newcomer, "/auth/discord/start"); response.StatusCode != http.StatusFound || response.Header.Get("Location") != "/" {
		t.Fatalf("callback: %d %s", response.StatusCode, response.Header.Get("Location"))
	}
	_, body = newcomer.do("GET", "/api/me", "", nil)
	discordID := body["user"].(map[string]any)["id"]
	if body["user"].(map[string]any)["displayName"] != "Ada" || discordID == adaID {
		t.Fatalf("discord account: %v", body)
	}
	returning := newClient(t, site.URL)
	signIn(returning, "/auth/discord/start")
	if _, body := returning.do("GET", "/api/me", "", nil); body["user"].(map[string]any)["id"] != discordID {
		t.Fatalf("same identity made a new account: %v", body)
	}
	if response, body := signIn(ada, "/auth/discord/start?link=1"); response.StatusCode != http.StatusConflict {
		t.Fatalf("linking someone else's identity: %d %v", response.StatusCode, body)
	}
	fake.subject = "77"
	if response, _ := signIn(ada, "/auth/discord/start?link=1"); response.StatusCode != http.StatusFound {
		t.Fatalf("link: %d", response.StatusCode)
	}
	byDiscord := newClient(t, site.URL)
	signIn(byDiscord, "/auth/discord/start")
	if _, body := byDiscord.do("GET", "/api/me", "", nil); body["user"].(map[string]any)["id"] != adaID {
		t.Fatalf("linked identity signs in to the wrong account: %v", body)
	}
	replay := newClient(t, site.URL)
	response, _ = replay.do("GET", "/auth/discord/start", "", nil)
	location, _ := url.Parse(response.Header.Get("Location"))
	state := url.QueryEscape(location.Query().Get("state"))
	replay.do("GET", "/auth/discord/callback?code=good-code&state="+state, "", nil)
	if response, _ := replay.do("GET", "/auth/discord/callback?code=good-code&state="+state, "", nil); response.StatusCode != http.StatusBadRequest {
		t.Fatalf("state reused: %d", response.StatusCode)
	}
}
