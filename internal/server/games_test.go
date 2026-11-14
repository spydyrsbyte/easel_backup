package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
	"easel/internal/games"
	"easel/internal/platform"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

func gameManager(t *testing.T, pool *pgxpool.Pool) *games.Manager {
	t.Helper()
	catalog, err := platform.LoadCatalog("../../server/easel")
	if err != nil {
		t.Fatal(err)
	}
	definition, err := platform.Load("../../server/easel/server")
	if err != nil {
		t.Fatal(err)
	}
	manager := &games.Manager{Pool: pool, Catalog: catalog, Globals: definition.Libraries, Folder: t.TempDir()}
	t.Cleanup(manager.Close)
	return manager
}

func TestServerApplicationRunsGames(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	manager := gameManager(t, pool)
	service := &accounts.Service{Pool: pool}
	application := serverApplication(t, "../../server/easel/server", manager.Scripting(), ScriptedUsers(service))
	router, err := NewServerRouter(manager, application)
	if err != nil {
		t.Fatal(err)
	}
	listed, err := manager.List(ctx)
	if err != nil || len(listed) != 1 || listed[0].Access != games.Open || listed[0].Application != "easel.demo.table" {
		t.Fatalf("default game: %+v %v", listed, err)
	}
	demo := listed[0]
	if !demo.Running {
		if err := manager.Start(ctx, demo.ID); err != nil {
			t.Fatal(err)
		}
	}
	if info, err := os.Stat(filepath.Join(manager.Folder, demo.ID)); err != nil || !info.IsDir() {
		t.Fatalf("game folder: %v", err)
	}
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: service, Policy: application, Router: router, PublicURL: "http://" + site.Listener.Addr().String()})
	site.Start()
	defer site.Close()
	ada := newClient(t, site.URL)
	response, body := ada.do("POST", "/api/accounts", `{"username":"ada","password":"correct horse"}`, nil)
	if response.StatusCode != http.StatusCreated {
		t.Fatal(response.StatusCode, body)
	}
	adaUser := accounts.User{ID: body["user"].(map[string]any)["id"].(string), DisplayName: "ada"}
	dial := func(user *client) (*websocket.Conn, func() map[string]any) {
		t.Helper()
		request, _ := http.NewRequest("GET", site.URL, nil)
		header := http.Header{"Origin": {site.URL}}
		for _, cookie := range user.http.Jar.Cookies(request.URL) {
			header.Add("Cookie", cookie.String())
		}
		c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(site.URL, "http")+"/client/http", header)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { c.Close() })
		c.SetReadDeadline(time.Now().Add(10 * time.Second))
		return c, func() map[string]any {
			t.Helper()
			var f map[string]any
			if err := c.ReadJSON(&f); err != nil {
				t.Fatal(err)
			}
			return f
		}
	}
	c, read := dial(ada)
	c.WriteJSON(map[string]any{"type": "hello", "id": "h", "protocol": protocolVersion{1, 0}})
	if f := read(); f["type"] != "welcome" || f["replyTo"] != "h" || f["game"] != nil || !strings.Contains(fmt.Sprint(f["packages"]), "easel.easel.lobby") {
		t.Fatalf("a signed-in connection starts in the server application: %v", f)
	}
	if _, admin, err := service.Account(ctx, adaUser.ID); err != nil || !admin {
		t.Fatalf("the first connection becomes an administrator: %v %v", admin, err)
	}
	if response, _ := ada.do("GET", "/assets/easel.easel.lobby-0.1.0/client/lobby.mjs", "", nil); response.StatusCode != http.StatusOK {
		t.Fatalf("server application asset: %d", response.StatusCode)
	}
	c.WriteJSON(map[string]any{"type": "ready", "id": "r0"})
	if f := read(); f["type"] != "ready.ok" {
		t.Fatal(f)
	}
	state := read()
	if state["type"] != "event" || state["name"] != "lobby.state" {
		t.Fatalf("ready connection receives the lobby: %v", state)
	}
	if payload := state["payload"].(map[string]any); payload["admin"] != true || len(payload["games"].([]any)) != 1 || len(payload["applications"].([]any)) != 5 {
		t.Fatalf("lobby state: %v", payload)
	}
	c.WriteJSON(map[string]any{"type": "event", "id": "j", "name": "lobby.join", "payload": map[string]any{"game": demo.ID}})
	if f := read(); f["type"] != "event.ack" {
		t.Fatal(f)
	}
	if f := read(); f["type"] != "welcome" || f["replyTo"] != nil || f["game"] != demo.ID {
		t.Fatalf("joining moves the connection into the game: %v", f)
	}
	members, err := manager.Members(ctx, demo.ID)
	if err != nil || len(members) != 1 || members[0].ID != adaUser.ID {
		t.Fatalf("joining an open game makes a member: %+v %v", members, err)
	}
	var principal string
	if err := pool.QueryRow(ctx, `SELECT principal_type FROM game_data.security_principals WHERE game_id=$1 AND id=$2`, demo.ID, adaUser.ID).Scan(&principal); err != nil || principal != "easel.easel.User" {
		t.Fatalf("member principal: %q %v", principal, err)
	}
	c.WriteJSON(map[string]any{"type": "subscribe", "id": "s", "names": []string{"easel.demo.result"}})
	if f := read(); f["type"] != "subscription.ack" || len(f["accepted"].([]any)) != 1 {
		t.Fatal(f)
	}
	c.WriteJSON(map[string]any{"type": "ready", "id": "r"})
	read()
	c.WriteJSON(map[string]any{"type": "event", "id": "e", "name": "easel.demo.roll", "payload": map[string]any{}})
	if first, second := read(), read(); first["type"] != "event" || second["type"] != "event.ack" {
		t.Fatal(first, second)
	}
	if response, _ := ada.do("GET", "/assets/easel.easel.ui-0.0.0/client/button.mjs", "", nil); response.StatusCode != http.StatusOK {
		t.Fatalf("member asset: %d", response.StatusCode)
	}
	c.WriteJSON(map[string]any{"type": "leave", "id": "l"})
	if f := read(); f["type"] != "welcome" || f["replyTo"] != "l" || f["game"] != nil {
		t.Fatalf("leaving returns to the server application: %v", f)
	}
	c.WriteJSON(map[string]any{"type": "ready", "id": "r1"})
	if f, g := read(), read(); f["type"] != "ready.ok" || g["name"] != "lobby.state" {
		t.Fatal(f, g)
	}
	c.WriteJSON(map[string]any{"type": "event", "id": "e2", "name": "easel.demo.roll", "payload": map[string]any{}})
	if f := read(); f["type"] != "error" || f["code"] != "event.unknown" {
		t.Fatalf("game events do not reach the server application: %v", f)
	}
	c.WriteJSON(map[string]any{"type": "event", "id": "c", "name": "lobby.create", "payload": map[string]any{"name": "Second table", "application": "easel.demo.table", "modules": []string{"easel.easel.ui", "easel.table.style"}, "access": "open"}})
	if f := read(); f["type"] != "event.ack" {
		t.Fatalf("an administrator creates a game: %v", f)
	}
	listed, err = manager.List(ctx)
	if err != nil || len(listed) != 2 || listed[1].Name != "Second table" || !listed[1].Running {
		t.Fatalf("created game: %+v %v", listed, err)
	}

	bob := newClient(t, site.URL)
	if response, body := bob.do("POST", "/api/accounts", `{"username":"bob","password":"correct horse"}`, nil); response.StatusCode != http.StatusCreated {
		t.Fatal(response.StatusCode, body)
	}
	b, readBob := dial(bob)
	b.WriteJSON(map[string]any{"type": "hello", "id": "h", "protocol": protocolVersion{1, 0}})
	readBob()
	b.WriteJSON(map[string]any{"type": "ready", "id": "r"})
	readBob()
	if payload := readBob()["payload"].(map[string]any); payload["admin"] != false || len(payload["games"].([]any)) != 2 || len(payload["applications"].([]any)) != 0 {
		t.Fatalf("player lobby state: %v", payload)
	}
	b.WriteJSON(map[string]any{"type": "event", "id": "c", "name": "lobby.create", "payload": map[string]any{"name": "Bob's table", "application": "easel.demo.table", "modules": []string{}, "access": "open"}})
	if f, g := readBob(), readBob(); f["name"] != "lobby.error" || g["type"] != "event.ack" {
		t.Fatalf("a player cannot create games: %v %v", f, g)
	}
	if listed, _ := manager.List(ctx); len(listed) != 2 {
		t.Fatalf("player created a game: %+v", listed)
	}
	b.WriteJSON(map[string]any{"type": "event", "id": "s", "name": "lobby.stop", "payload": map[string]any{"game": demo.ID}})
	if f, g := readBob(), readBob(); f["name"] != "lobby.error" || g["type"] != "event.ack" {
		t.Fatalf("a player cannot stop games: %v %v", f, g)
	}

	c.WriteJSON(map[string]any{"type": "event", "id": "j2", "name": "lobby.join", "payload": map[string]any{"game": demo.ID}})
	if f, g := read(), read(); f["type"] != "event.ack" || g["game"] != demo.ID {
		t.Fatal(f, g)
	}
	if err := manager.Remove(ctx, demo.ID, adaUser.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := c.ReadMessage(); err == nil {
		t.Fatal("removed member stayed connected")
	}
	if err := manager.Remove(ctx, listed[1].ID, adaUser.ID); err != nil {
		t.Fatal(err)
	}
	if response, _ := ada.do("GET", "/assets/easel.easel.ui-0.0.0/client/button.mjs", "", nil); response.StatusCode != http.StatusNotFound {
		t.Fatalf("removed member asset: %d", response.StatusCode)
	}
	if err := pool.QueryRow(ctx, `SELECT principal_type FROM game_data.security_principals WHERE game_id=$1 AND id=$2`, demo.ID, adaUser.ID).Scan(&principal); err == nil {
		t.Fatal("removed member kept a principal")
	}

	private, err := manager.Create(ctx, "Private table", "easel.demo.table", []string{"easel.easel.ui", "easel.table.style"}, games.MembersOnly)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Join(ctx, private.ID, adaUser); !errors.Is(err, games.ErrMembersOnly) {
		t.Fatalf("non-member join: %v", err)
	}
	if err := manager.AddMember(ctx, private.ID, adaUser.ID); err != nil {
		t.Fatal(err)
	}
	if member, err := manager.IsMember(ctx, private.ID, adaUser.ID); err != nil || !member {
		t.Fatalf("added user is a member before joining: %v %v", member, err)
	}
	if roles, err := manager.Roles(ctx, private.ID); err != nil || !strings.Contains(fmt.Sprint(roles), adaUser.ID) || !strings.Contains(fmt.Sprint(roles), "role:player") {
		t.Fatalf("added user is listed as a player: %v %v", roles, err)
	}
	if err := manager.AddMember(ctx, private.ID, adaUser.ID); err != nil {
		t.Fatalf("adding a member twice: %v", err)
	}
	if err := manager.Join(ctx, private.ID, adaUser); err != nil {
		t.Fatalf("member join: %v", err)
	}
	if err := manager.AddMember(ctx, private.ID, "10000000-0000-0000-0000-00000000dead"); !errors.Is(err, games.ErrUnknownUser) {
		t.Fatalf("add unknown user: %v", err)
	}
	if err := manager.SetAccess(ctx, private.ID, "public"); !errors.Is(err, games.ErrInvalidAccess) {
		t.Fatalf("bad access: %v", err)
	}
	if err := manager.Start(ctx, demo.ID); !errors.Is(err, games.ErrRunning) {
		t.Fatalf("start twice: %v", err)
	}
	if err := manager.Stop(demo.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, demo.ID); err != nil {
		t.Fatalf("restart: %v", err)
	}
	var revisions int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM game_data.contract_revisions WHERE game_id=$1`, demo.ID).Scan(&revisions); err != nil || revisions != 1 {
		t.Fatalf("unchanged packages republished: %d %v", revisions, err)
	}

	unrouted := hookedServer(t, allowEveryone)
	lobby := httptest.NewUnstartedServer(nil)
	unroutedRouter, err := NewServerRouter(manager, unrouted)
	if err != nil {
		t.Fatal(err)
	}
	lobby.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: &accounts.Service{Pool: pool}, Policy: unrouted, Router: unroutedRouter, PublicURL: "http://" + lobby.Listener.Addr().String()})
	lobby.Start()
	defer lobby.Close()
	token, _, err := (&accounts.Service{Pool: pool}).StartSession(ctx, adaUser.ID)
	if err != nil {
		t.Fatal(err)
	}
	waiting, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(lobby.URL, "http")+"/client/http", http.Header{"Origin": {lobby.URL}})
	if err != nil {
		t.Fatal(err)
	}
	defer waiting.Close()
	waiting.SetReadDeadline(time.Now().Add(10 * time.Second))
	waiting.WriteJSON(map[string]any{"type": "hello", "id": "h", "protocol": protocolVersion{1, 0}, "token": token})
	var f map[string]any
	if err := waiting.ReadJSON(&f); err != nil || f["code"] != "game.none" {
		t.Fatalf("unrouted connection: %v %v", f, err)
	}
	waiting.WriteJSON(map[string]any{"type": "ready", "id": "r"})
	if err := waiting.ReadJSON(&f); err != nil || f["code"] != "game.none" || f["replyTo"] != "r" {
		t.Fatalf("unrouted connection stays in the server application: %v %v", f, err)
	}
}

func TestDeleteGame(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	manager := gameManager(t, pool)
	tables := []string{"games", "automations", "contributors", "record_types", "contract_revisions", "revision_contributors", "schema_contributions", "revision_contributions", "effective_schemas", "records", "record_fragments", "security_principals", "security_relationships", "security_registries", "security_assignments", "members"}
	rows := func(id string) map[string]int {
		counts := map[string]int{}
		for _, table := range tables {
			var count int
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM game_data.`+table+` WHERE game_id=$1`, id).Scan(&count); err != nil {
				t.Fatal(table, err)
			}
			if count > 0 {
				counts[table] = count
			}
		}
		return counts
	}
	chess, err := manager.Create(ctx, "Chess", "easel.chess.game", nil, games.Open)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, chess.ID); err != nil {
		t.Fatal(err)
	}
	before := rows(chess.ID)
	if before["records"] == 0 || before["automations"] == 0 {
		t.Fatalf("running game should have records and automations: %v", before)
	}
	for _, marker := range []string{"", "00000000-0000-0000-0000-000000000000"} {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `SELECT set_config('easel.delete_game', $1, true)`, marker); err != nil {
			t.Fatal(err)
		}
		_, err = tx.Exec(ctx, `DELETE FROM game_data.effective_schemas WHERE game_id=$1`, chess.ID)
		tx.Rollback(ctx)
		if err == nil || !strings.Contains(err.Error(), "Sealed revision contents are immutable") {
			t.Fatalf("sealed revision contents deleted with marker %q: %v", marker, err)
		}
	}
	if err := manager.Delete(ctx, chess.ID); err != nil {
		t.Fatal(err)
	}
	if left := rows(chess.ID); len(left) != 0 {
		t.Fatalf("rows left after delete: %v", left)
	}
	if _, running := manager.Runtime(chess.ID); running {
		t.Fatal("deleted game is still running")
	}
	if _, err := os.Stat(filepath.Join(manager.Folder, chess.ID)); !os.IsNotExist(err) {
		t.Fatalf("game folder remains: %v", err)
	}
	if _, err := manager.Get(ctx, chess.ID); err == nil {
		t.Fatal("deleted game is still listed")
	}
	legacy, err := manager.Create(ctx, "Legacy", "easel.chess.game", nil, games.Open)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE game_data.contributors SET name='chess.game' WHERE game_id=$1 AND kind='application'`, legacy.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, legacy.ID); err == nil || !strings.Contains(err.Error(), "legacy two-part identity") {
		t.Fatalf("legacy game should not start: %v", err)
	}
	if err := manager.Delete(ctx, legacy.ID); err != nil {
		t.Fatal(err)
	}
	if left := rows(legacy.ID); len(left) != 0 {
		t.Fatalf("rows left after deleting legacy game: %v", left)
	}
	if err := manager.Delete(ctx, legacy.ID); !errors.Is(err, games.ErrUnknownGame) {
		t.Fatalf("deleting twice: %v", err)
	}
	if err := manager.Delete(ctx, "../outside"); !errors.Is(err, games.ErrUnknownGame) {
		t.Fatalf("invalid id: %v", err)
	}
}
