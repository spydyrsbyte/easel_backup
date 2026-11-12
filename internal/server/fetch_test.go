package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
)

func TestFetchEndpoint(t *testing.T) {
	pool := dbtest.Open(t)
	decks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("1 Sol Ring\n1 Command Tower\n"))
	}))
	defer decks.Close()
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: &accounts.Service{Pool: pool}, Policy: hookedServer(t, allowEveryone), PublicURL: "http://" + site.Listener.Addr().String()})
	site.Start()
	defer site.Close()
	path := "/api/fetch?url=" + url.QueryEscape(decks.URL+"/deck.txt")
	if response, _ := http.Get(site.URL + path); response.StatusCode != http.StatusUnauthorized {
		t.Fatal("signed-out fetch was allowed", response.StatusCode)
	}
	user := newClient(t, site.URL)
	if response, body := user.do("POST", "/api/accounts", `{"username":"fetch-user","password":"correct horse"}`, nil); response.StatusCode != http.StatusCreated {
		t.Fatal(response.StatusCode, body)
	}
	get := func(target string) (*http.Response, string) {
		t.Helper()
		response, err := user.http.Get(site.URL + target)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		body, _ := io.ReadAll(response.Body)
		return response, string(body)
	}
	if response, _ := get(path); response.StatusCode != http.StatusForbidden {
		t.Fatal("a private address was fetched", response.StatusCode)
	}
	fetchPrivateAllowed = true
	defer func() { fetchPrivateAllowed = false }()
	response, body := get(path)
	if response.StatusCode != http.StatusOK || body != "1 Sol Ring\n1 Command Tower\n" {
		t.Fatal("deck list was not fetched", response.StatusCode, body)
	}
	if response.Header.Get("Content-Security-Policy") == "" || response.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("fetched content is not sandboxed")
	}
	if response, _ := get("/api/fetch?url=" + url.QueryEscape("file:///etc/passwd")); response.StatusCode != http.StatusBadRequest {
		t.Fatal("non-web scheme accepted", response.StatusCode)
	}
}
