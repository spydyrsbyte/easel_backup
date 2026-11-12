package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

func TestTabletopMagicGame(t *testing.T) {
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	ctx := context.Background()
	accountsService := &accounts.Service{Pool: pool}
	users := []accounts.User{}
	for _, name := range []string{"table-owner", "table-guest", "table-viewer"} {
		user, err := accountsService.SignUp(ctx, name, "correct horse", name)
		if err != nil {
			t.Fatal(err)
		}
		users = append(users, user)
	}
	owner, guest, viewer := users[0], users[1], users[2]
	game, err := manager.Create(security.WithPrincipal(ctx, owner.ID), "Six seats", "easel.mtgtable.game", nil, games.Open)
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
			if name == "easel.mtgtable.state" || name == "easel.mtgtable.result" {
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
		response, err := request(user, "easel.mtgtable.sync", map[string]any{})
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
		response, err := request(user, "easel.mtgtable.action", map[string]any{"request": "test", "payload": payload})
		if err != nil {
			t.Fatal(action, err)
		}
		return response["result"].(map[string]any)
	}
	success := func(user accounts.User, action string, payload map[string]any) map[string]any {
		t.Helper()
		result := act(user, action, payload)
		if result["ok"] != true {
			t.Fatal(action, result)
		}
		return result
	}
	success(owner, "sit", map[string]any{"seat": "White"})
	success(guest, "sit", map[string]any{"seat": "Green"})
	if result := act(guest, "sit", map[string]any{"seat": "White"}); result["declined"] != true {
		t.Fatal("seat was taken twice", result)
	}
	deck := []any{}
	for index := 0; index < 30; index++ {
		deck = append(deck, map[string]any{"name": fmt.Sprintf("Hidden Bear %d", index), "type": "Creature — Bear", "cmc": 2})
		deck = append(deck, map[string]any{"name": "Forest", "type": "Basic Land — Forest", "cmc": 0})
	}
	success(owner, "import", map[string]any{"name": "Bear deck", "main": deck, "commander": []any{map[string]any{"name": "Bear Lord", "type": "Legendary Creature — Bear", "cmc": 4}}})
	success(owner, "mulligan", nil)
	success(owner, "button", map[string]any{"button": "draw", "count": 2})
	success(owner, "button", map[string]any{"button": "scry"})
	if result := act(guest, "button", map[string]any{"button": "draw", "seat": "White"}); result["declined"] != true {
		t.Fatal("guest used another seat's draw button", result)
	}
	own := state(owner)
	hands := own["hands"].(map[string]any)["White"].([]any)
	if len(hands[0].([]any)) != 9 || len(hands[1].([]any)) != 1 {
		t.Fatal("draw and scry did not reach the hand zones", len(hands[0].([]any)), len(hands[1].([]any)))
	}
	first := hands[0].([]any)[0].(map[string]any)
	if first["card"] == nil {
		t.Fatal("owner cannot see their hand")
	}
	hidden := map[string]bool{}
	for _, item := range hands[0].([]any) {
		card := item.(map[string]any)["card"].(map[string]any)
		if strings.HasPrefix(card["name"].(string), "Hidden Bear") {
			hidden[card["name"].(string)] = true
		}
	}
	for _, user := range []accounts.User{guest, viewer} {
		data, _ := json.Marshal(state(user))
		for name := range hidden {
			if strings.Contains(string(data), "\""+name+"\"") {
				t.Fatal("hand card leaked", name)
			}
		}
		if strings.Contains(string(data), "Hidden Bear 29\"") && !hidden["Hidden Bear 29"] {
			t.Fatal("library leaked")
		}
	}
	success(owner, "button", map[string]any{"button": "mill", "count": 3})
	success(owner, "cascade", map[string]any{"cmc": 3})
	success(owner, "resolve", map[string]any{"accept": true})
	success(owner, "chat", map[string]any{"message": "drain 3"})
	players := state(guest)["players"].(map[string]any)
	if players["White"].(map[string]any)["life"].(float64) != 43 || players["Green"].(map[string]any)["life"].(float64) != 37 {
		t.Fatal("life chat command was not applied", players)
	}
	success(guest, "chat", map[string]any{"message": "my turn"})
	if turn := state(owner)["turn"].(map[string]any); turn["color"] != "Green" || turn["enabled"] != true {
		t.Fatal("turn command failed", turn)
	}
	success(viewer, "chat", map[string]any{"message": "Hello from the rail"})
	if _, err := request(viewer, "easel.mtgtable.action", map[string]any{"request": "denied", "payload": map[string]any{"action": "sit", "seat": "Blue"}}); !errors.Is(err, security.ErrDenied) {
		t.Fatal("spectator played", err)
	}
	var bag string
	for _, item := range state(owner)["objects"].([]any) {
		object := item.(map[string]any)
		if object["template"] == "die" && object["kind"] == "bag" {
			bag = object["id"].(string)
			break
		}
	}
	success(owner, "take_from_bag", map[string]any{"id": bag, "x": 0, "z": 0})
	if err := manager.Stop(game.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, game.ID); err != nil {
		t.Fatal(err)
	}
	runtime, _ = manager.Runtime(game.ID)
	restored := state(owner)
	if restored["seats"].(map[string]any)["White"].(map[string]any)["user"] != owner.ID || len(restored["hands"].(map[string]any)["White"].([]any)[0].([]any)) != 9 {
		t.Fatal("restart lost table state")
	}
	if result := act(guest, "reset", nil); result["declined"] != true {
		t.Fatal("a player reset the table", result)
	}
	success(owner, "reset", nil)
	if len(state(owner)["hands"].(map[string]any)["White"].([]any)[0].([]any)) != 0 {
		t.Fatal("reset kept cards")
	}
}

func TestTabletopMagicBrowser(t *testing.T) {
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
	command := exec.CommandContext(ctx, "node", "../../scripts/test-mtgtable-browser.mjs", site.URL)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("browser: %v\n%s", err, output)
	} else {
		t.Log(string(output))
	}
}
