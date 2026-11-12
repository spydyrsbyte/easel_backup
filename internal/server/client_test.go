package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
	"easel/internal/security"
	"github.com/gorilla/websocket"
)

func TestBrowserClient(t *testing.T) {
	if os.Getenv("EASEL_PLAYWRIGHT_MODULE") == "" {
		t.Skip("set EASEL_PLAYWRIGHT_MODULE to playwright/index.mjs for browser acceptance")
	}
	pool := dbtest.Open(t)
	g, err := NewDemoGame(context.Background(), "../../server/easel", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Runtime.Close()
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: &accounts.Service{Pool: pool}, Policy: hookedServer(t, allowEveryone), Router: SingleGame(g), PublicURL: "http://" + site.Listener.Addr().String()})
	site.Start()
	defer site.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", "../../scripts/test-browser.mjs", site.URL)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("browser: %v\n%s", err, output)
	} else {
		t.Log(string(output))
	}
}

func TestProtocolFrames(t *testing.T) {
	for _, data := range []string{`null`, `[]`, `{"type":"ready"}`, `{"type":"hello","id":"1","protocol":{"major":1}}`, `{"type":"hello","id":"1","protocol":{"major":1.5,"minor":0}}`, `{"type":"hello","id":"1","protocol":{"major":null,"minor":0}}`, `{"type":"event","id":"1","name":"x","payload":{},"origin":"server"}`, `{"type":"ready","id":"1","replyTo":4}`, `{"type":"subscribe","id":"1","names":[1]}`, `{"type":"ready","id":null}`} {
		if _, err := parseFrame([]byte(data)); err == nil {
			t.Errorf("accepted %s", data)
		}
	}
	if _, err := parseFrame([]byte(`{"type":"hello","id":"1","protocol":{"major":1,"minor":9},"future":true}`)); err != nil {
		t.Fatal(err)
	}
}

func TestDemoRuntime(t *testing.T) {
	g, err := NewDemoGame(context.Background(), "../../server/easel", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Runtime.Close()
	ctx := security.WithPrincipal(context.Background(), "ada")
	received := make(chan json.RawMessage, 1)
	off, err := g.Runtime.SubscribeClient(ctx, "easel.demo.result", func(data json.RawMessage) { received <- data })
	if err != nil {
		t.Fatal(err)
	}
	defer off()
	if err = g.Runtime.EmitAuthorizedClient(ctx, "easel.demo.roll", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	select {
	case data := <-received:
		var result struct{ Value int }
		if json.Unmarshal(data, &result) != nil || result.Value < 1 || result.Value > 20 {
			t.Fatal(string(data))
		}
	case <-time.After(time.Second):
		t.Fatal("no delivery")
	}
	if err = g.Runtime.EmitAuthorizedClient(ctx, "easel.demo.result", json.RawMessage(`{"value":20}`)); err == nil {
		t.Fatal("client spoofed server event")
	}
}

func TestClientSocketAndResources(t *testing.T) {
	pool := dbtest.Open(t)
	g, err := NewDemoGame(context.Background(), "../../server/easel", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Runtime.Close()
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: &accounts.Service{Pool: pool}, Policy: hookedServer(t, allowEveryone), Router: SingleGame(g), PublicURL: "http://" + site.Listener.Addr().String()})
	site.Start()
	defer site.Close()
	user := newClient(t, site.URL)
	response, body := user.do("POST", "/api/accounts", `{"username":"socket-user","password":"correct horse"}`, nil)
	if response.StatusCode != 201 {
		t.Fatal(response.StatusCode, body)
	}
	request, _ := http.NewRequest("GET", site.URL, nil)
	header := http.Header{"Origin": {site.URL}}
	token := ""
	for _, cookie := range user.http.Jar.Cookies(request.URL) {
		header.Add("Cookie", cookie.String())
		token = cookie.Value
	}
	dial := func(route string) *websocket.Conn {
		t.Helper()
		c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(site.URL, "http")+route, header)
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
	for _, test := range []struct{ route, hello, code string }{
		{"/client/http", `{"type":"hello","id":"h","protocol":{"major":2,"minor":0}}`, "protocol.unsupported"},
		{"/client/http", `{"type":"ready","id":"r"}`, "protocol.invalid"},
		{"/client/android", `{"type":"hello","id":"h","protocol":{"major":1,"minor":0},"token":"` + token + `"}`, "client.unsupported"},
	} {
		c := dial(test.route)
		c.WriteMessage(websocket.TextMessage, []byte(test.hello))
		if f := read(c); f["code"] != test.code {
			t.Fatal(f)
		}
		if _, _, err := c.ReadMessage(); err == nil {
			t.Fatal("connection remained open")
		}
		c.Close()
	}
	c := dial("/client/http")
	c.WriteJSON(map[string]any{"type": "hello", "id": "h", "protocol": protocolVersion{1, 9}})
	welcome := read(c)
	encoded, _ := json.Marshal(welcome)
	if welcome["type"] != "welcome" || welcome["protocol"].(map[string]any)["minor"] != float64(0) || strings.Contains(string(encoded), "server/") {
		t.Fatal(string(encoded))
	}
	c.WriteJSON(map[string]any{"type": "subscribe", "id": "s", "names": []string{"easel.demo.result", "easel.demo.roll"}})
	if f := read(c); len(f["accepted"].([]any)) != 1 || len(f["rejected"].([]any)) != 1 {
		t.Fatal(f)
	}
	c.WriteJSON(map[string]any{"type": "ready", "id": "r"})
	if f := read(c); f["type"] != "ready.ok" {
		t.Fatal(f)
	}
	c.WriteJSON(map[string]any{"type": "event", "id": "e", "name": "easel.demo.roll", "payload": map[string]any{}})
	first, second := read(c), read(c)
	if first["type"] != "event" || second["type"] != "event.ack" || second["replyTo"] != "e" {
		t.Fatal(first, second)
	}
	c.WriteJSON(map[string]any{"type": "unsubscribe", "id": "u", "names": []string{"easel.demo.result"}})
	if f := read(c); f["type"] != "subscription.ack" {
		t.Fatal(f)
	}
	c.WriteJSON(map[string]any{"type": "event", "id": "bad", "name": "easel.demo.roll", "payload": map[string]any{"extra": true}})
	if f := read(c); f["code"] != "event.invalid" || f["replyTo"] != "bad" {
		t.Fatal(f)
	}
	asset := "/assets/easel.easel.ui-0.0.0/client/button.mjs"
	response, _ = user.do("GET", asset, "", nil)
	if response.StatusCode != 200 || response.Header.Get("ETag") == "" {
		t.Fatal(response.StatusCode)
	}
	response, _ = user.do("GET", asset, "", map[string]string{"If-None-Match": response.Header.Get("ETag")})
	if response.StatusCode != 304 {
		t.Fatal(response.StatusCode)
	}
	for _, file := range []string{"/assets/easel.demo.table-0.0.0/server/application.mjs", "/assets/easel.demo.table-0.0.0/manifest.json"} {
		if response, _ = user.do("GET", file, "", nil); response.StatusCode != 404 {
			t.Fatal(response.StatusCode, file)
		}
	}
	if response, _ = user.do("GET", "/client/http", "", nil); response.StatusCode != 426 {
		t.Fatal(response.StatusCode)
	}
	badHeader := header.Clone()
	badHeader.Set("Origin", "https://evil.example")
	if conn, resp, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(site.URL, "http")+"/client/http", badHeader); err == nil {
		conn.Close()
		t.Fatal("accepted cross-site socket")
	} else if resp.StatusCode != 403 {
		t.Fatal(resp.StatusCode)
	}
	user.do("DELETE", "/api/sessions", "", nil)
	c.WriteJSON(map[string]any{"type": "event", "id": "revoked", "name": "easel.demo.roll", "payload": map[string]any{}})
	if f := read(c); f["code"] != "auth.required" {
		t.Fatal(f)
	}
}
