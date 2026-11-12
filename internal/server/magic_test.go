package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
	"easel/internal/games"
	"easel/internal/jsapi"
	"easel/internal/security"
)

func TestMagicGame(t *testing.T) {
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	ctx := context.Background()
	accountsService := &accounts.Service{Pool: pool}
	users := []accounts.User{}
	for _, name := range []string{"magic-owner", "magic-guest", "magic-viewer"} {
		user, err := accountsService.SignUp(ctx, name, "correct horse", name)
		if err != nil {
			t.Fatal(err)
		}
		users = append(users, user)
	}
	owner, guest, viewer := users[0], users[1], users[2]
	game, err := manager.Create(security.WithPrincipal(ctx, owner.ID), "Commander night", "easel.mtg.game", nil, games.Open)
	if err != nil {
		t.Fatal(err)
	}
	for _, user := range users[1:] {
		if err := manager.Join(ctx, game.ID, user); err != nil {
			t.Fatal(err)
		}
	}
	if err := manager.SetRole(ctx, game.ID, viewer.ID, "spectator"); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, game.ID); err != nil {
		t.Fatal(err)
	}
	runtime, _ := manager.Runtime(game.ID)
	request := func(user accounts.User, event string, payload map[string]any) (map[string]any, error) {
		response := map[string]any{}
		connection := &jsapi.Connection{User: map[string]any{"id": user.ID, "displayName": user.DisplayName}, Send: func(name string, data json.RawMessage) error {
			if name == "easel.mtg.state" || name == "easel.mtg.result" {
				return json.Unmarshal(data, &response)
			}
			return nil
		}}
		data, _ := json.Marshal(payload)
		err := runtime.EmitAuthorizedClient(jsapi.WithConnection(security.WithPrincipal(ctx, user.ID), connection), event, data)
		return response, err
	}
	state := func(user accounts.User) map[string]any {
		t.Helper()
		response, err := request(user, "easel.mtg.sync", map[string]any{})
		if err != nil {
			t.Fatal(err)
		}
		return response["state"].(map[string]any)
	}
	act := func(user accounts.User, action string, payload map[string]any) map[string]any {
		t.Helper()
		if payload == nil {
			payload = map[string]any{}
		}
		payload["action"] = action
		response, err := request(user, "easel.mtg.action", map[string]any{"request": "test", "payload": payload})
		if err != nil {
			t.Fatal(action, err)
		}
		result := response["result"].(map[string]any)
		return result
	}
	success := func(user accounts.User, action string, payload map[string]any) {
		t.Helper()
		if result := act(user, action, payload); result["ok"] != true {
			t.Fatal(action, result)
		}
	}
	success(owner, "sit", nil)
	success(guest, "sit", nil)
	if len(state(owner)["players"].([]any)) != 2 {
		t.Fatal("seats were not saved")
	}
	success(owner, "import", map[string]any{"name": "Secret deck", "entries": []any{map[string]any{"name": "Private Lion", "type": "Creature — Cat", "power": "2", "toughness": "2", "mana": "{1}{W}", "quantity": 4, "section": "main"}}})
	success(guest, "import", map[string]any{"name": "Guest deck", "entries": []any{map[string]any{"name": "Guest Wall", "type": "Creature — Wall", "power": "0", "toughness": "1", "quantity": 4, "section": "main"}}})
	success(owner, "draw", map[string]any{"count": 2})
	snapshot := state(owner)
	cards := snapshot["cards"].([]any)
	var lion string
	for _, item := range cards {
		card := item.(map[string]any)
		if card["name"] == "Private Lion" {
			lion = card["id"].(string)
			break
		}
	}
	if lion == "" {
		t.Fatal("own hand was not visible")
	}
	for _, user := range []accounts.User{guest, viewer} {
		data, _ := json.Marshal(state(user))
		if strings.Contains(string(data), "Private Lion") || strings.Contains(string(data), "Secret deck") {
			t.Fatal("private cards leaked", string(data))
		}
	}
	if result := act(guest, "move", map[string]any{"id": lion, "zone": "battlefield"}); result["declined"] != true {
		t.Fatal("guest moved owner's card", result)
	}
	success(owner, "cast", map[string]any{"id": lion})
	if len(state(guest)["stack"].([]any)) != 1 {
		t.Fatal("stack was not synchronized")
	}
	success(owner, "resolve", nil)
	success(owner, "attack", map[string]any{"id": lion, "target": guest.ID})
	success(owner, "combat-damage", nil)
	var guestLife float64
	for _, item := range state(guest)["players"].([]any) {
		player := item.(map[string]any)
		if player["id"] == guest.ID {
			guestLife = player["life"].(float64)
		}
	}
	if guestLife != 38 {
		t.Fatal("combat damage was not applied", guestLife)
	}
	success(owner, "modify", map[string]any{"id": lion, "changes": map[string]any{"counter": map[string]any{"name": "+1/+1", "delta": 1}}})
	success(owner, "assist", map[string]any{"untap": false})
	if state(owner)["assist"].(map[string]any)["untap"] != false {
		t.Fatal("turn preference was not saved")
	}
	success(owner, "token", map[string]any{"name": "Spirit", "type": "Token Creature", "power": "1", "toughness": "1"})
	success(owner, "set-events", map[string]any{"id": lion, "events": []any{map[string]any{"event": "card-enters", "scope": "all", "when": map[string]any{"types": "Creature"}, "response": map[string]any{"self": map[string]any{"type": "delta", "field": "life", "amount": 1}}}}})
	success(owner, "token", map[string]any{"name": "Another Spirit", "type": "Token Creature", "power": "1", "toughness": "1"})
	var ownerLife float64
	for _, item := range state(owner)["players"].([]any) {
		player := item.(map[string]any)
		if player["id"] == owner.ID {
			ownerLife = player["life"].(float64)
		}
	}
	if ownerLife != 41 {
		t.Fatal("card event response was not applied", ownerLife)
	}
	success(owner, "chat", map[string]any{"message": "Hello table"})
	if len(state(guest)["chat"].([]any)) != 1 {
		t.Fatal("chat not shared")
	}
	if _, err := request(viewer, "easel.mtg.action", map[string]any{"request": "denied", "payload": map[string]any{"action": "sit"}}); !errors.Is(err, security.ErrDenied) {
		t.Fatal("spectator played", err)
	}
	var revision int
	if err := pool.QueryRow(ctx, `SELECT record_version FROM game_data.records WHERE game_id=$1`, game.ID).Scan(&revision); err != nil || revision < 10 {
		t.Fatal("automation writes not persisted", revision, err)
	}
	if err := manager.Stop(game.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, game.ID); err != nil {
		t.Fatal(err)
	}
	runtime, _ = manager.Runtime(game.ID)
	if len(state(owner)["players"].([]any)) != 2 || len(state(owner)["cards"].([]any)) < 4 {
		t.Fatal("restart lost Magic state")
	}
	snapshot = state(owner)
	lion = ""
	for _, item := range snapshot["cards"].([]any) {
		card := item.(map[string]any)
		if card["zone"] == "hand" && card["controller"] == owner.ID {
			lion = card["id"].(string)
			break
		}
	}
	success(owner, "cast", map[string]any{"id": lion})
	deadline := time.Now().Add(9 * time.Second)
	for len(state(owner)["stack"].([]any)) > 0 && time.Now().Before(deadline) {
		time.Sleep(100 * time.Millisecond)
	}
	if len(state(owner)["stack"].([]any)) != 0 {
		t.Fatal("scheduled stack resolution did not run")
	}
}

func TestMagicBrowser(t *testing.T) {
	if os.Getenv("EASEL_PLAYWRIGHT_MODULE") == "" {
		t.Skip("set EASEL_PLAYWRIGHT_MODULE for browser acceptance")
	}
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	service := &accounts.Service{Pool: pool}
	application := serverApplication(t, "../../server/easel/server", manager.Scripting(), ScriptedUsers(service))
	router, err := NewServerRouter(manager, application)
	if err != nil {
		t.Fatal(err)
	}
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: service, Policy: application, Router: router, PublicURL: "http://" + site.Listener.Addr().String(), ReportError: func(_ *http.Request, err error) { t.Log(err) }})
	site.Start()
	defer site.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, "node", "../../scripts/test-magic-browser.mjs", site.URL)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("browser: %v\n%s", err, output)
	} else {
		t.Log(string(output))
	}
}
