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
	"easel/internal/automation"
	"easel/internal/automation/pgstore"
	"easel/internal/database/dbtest"
	"easel/internal/games"
	"easel/internal/jsapi"
	"easel/internal/schema"
	"easel/internal/security"
	"github.com/jackc/pgx/v5"
)

func TestBoardAutomations(t *testing.T) {
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	service := &accounts.Service{Pool: pool}
	ctx := context.Background()
	white, err := service.SignUp(ctx, "white", "correct horse", "White")
	if err != nil {
		t.Fatal(err)
	}
	black, err := service.SignUp(ctx, "black", "correct horse", "Black")
	if err != nil {
		t.Fatal(err)
	}
	watcher, err := service.SignUp(ctx, "watcher", "correct horse", "Watcher")
	if err != nil {
		t.Fatal(err)
	}
	for _, application := range []string{"easel.chess.game", "easel.checkers.game"} {
		t.Run(application, func(t *testing.T) {
			game, err := manager.Create(security.WithPrincipal(ctx, white.ID), application, application, []string{"easel.board.games"}, games.Open)
			if err != nil {
				t.Fatal(err)
			}
			for _, user := range []accounts.User{black, watcher} {
				if err := manager.Join(ctx, game.ID, user); err != nil {
					t.Fatal(err)
				}
			}
			if err := manager.SetRole(ctx, game.ID, watcher.ID, "spectator"); err != nil {
				t.Fatal(err)
			}
			if err := manager.Start(ctx, game.ID); err != nil {
				t.Fatal(err)
			}
			runtime, _ := manager.Runtime(game.ID)
			request := func(user accounts.User, event string, payload map[string]any) map[string]any {
				t.Helper()
				response := map[string]any{}
				connection := &jsapi.Connection{User: map[string]any{"id": user.ID, "displayName": user.DisplayName}, Send: func(name string, data json.RawMessage) error {
					if name == "easel.board.state" || name == "easel.board.error" {
						return json.Unmarshal(data, &response)
					}
					return nil
				}}
				data, _ := json.Marshal(payload)
				if err := runtime.EmitAuthorizedClient(jsapi.WithConnection(security.WithPrincipal(ctx, user.ID), connection), event, data); err != nil {
					t.Fatal(err)
				}
				return response
			}
			state := func() map[string]any {
				return request(white, "easel.board.refresh", map[string]any{})["match"].(map[string]any)
			}
			if got := request(watcher, "easel.board.seat", map[string]any{"side": "white"}); got["message"] == nil {
				t.Fatal("spectator claimed a seat")
			}
			request(white, "easel.board.seat", map[string]any{"side": "white"})
			request(black, "easel.board.seat", map[string]any{"side": "black"})
			before := state()
			from, to := 52, 36
			if application == "easel.checkers.game" {
				from, to = 40, 33
			}
			payload := map[string]any{"from": from, "to": to, "revision": before["revision"]}
			if got := request(black, "easel.board.move", payload); !strings.Contains(got["message"].(string), "not your turn") {
				t.Fatal(got)
			}
			if got := request(white, "easel.board.move", map[string]any{"from": from, "to": 0, "revision": before["revision"]}); got["message"] == nil {
				t.Fatal("illegal move accepted")
			}
			if got := request(white, "easel.board.move", payload); got["message"] != nil {
				t.Fatal(got)
			}
			after := state()
			if after["turn"] != "black" || after["squares"].([]any)[to].(map[string]any)["side"] != "white" || len(after["history"].([]any)) != 1 {
				t.Fatal(after)
			}
			if got := request(white, "easel.board.move", payload); got["message"] == nil {
				t.Fatal("stale move accepted")
			}
			if err := manager.Stop(game.ID); err != nil {
				t.Fatal(err)
			}
			if err := manager.Start(ctx, game.ID); err != nil {
				t.Fatal(err)
			}
			runtime, _ = manager.Runtime(game.ID)
			if saved := state(); saved["revision"] != after["revision"] || saved["seats"].(map[string]any)["white"] != white.ID {
				t.Fatal("restart lost state", saved)
			}
			var count int
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM game_data.automations WHERE game_id=$1`, game.ID).Scan(&count); err != nil || count != 5 {
				t.Fatal("automations were not persisted", count, err)
			}
			composed, err := schema.Compose(runtime.ClientPlan().Packages)
			if err != nil {
				t.Fatal(err)
			}
			store := &pgstore.Records{Pool: pool, GameID: game.ID, Schema: composed, AuthorizeRecord: func(context.Context, pgx.Tx, string, automation.Record) error { return nil }}
			var matchID string
			if err := pool.QueryRow(ctx, `SELECT record_id::text FROM game_data.records WHERE game_id=$1`, game.ID).Scan(&matchID); err != nil {
				t.Fatal(err)
			}
			fixture := func(pieces map[int]string) {
				t.Helper()
				tx, err := store.Begin(ctx)
				if err != nil {
					t.Fatal(err)
				}
				defer tx.Rollback(ctx)
				record, err := tx.Load(ctx, "easel.board.Match", matchID)
				if err != nil {
					t.Fatal(err)
				}
				squares := make([]any, 64)
				for index := range squares {
					side, kind := "", ""
					if piece := pieces[index]; piece != "" {
						parts := strings.Split(piece, " ")
						side, kind = parts[0], parts[1]
					}
					squares[index] = map[string]any{"x": index % 8, "y": index / 8, "side": side, "kind": kind}
				}
				record.Data["squares"], record.Data["turn"], record.Data["chain"], record.Data["winner"], record.Data["history"] = squares, "white", -1, "", []any{}
				if err := tx.Save(ctx, record); err != nil {
					t.Fatal(err)
				}
				if err := tx.Commit(ctx); err != nil {
					t.Fatal(err)
				}
			}
			tryMove := func(from, to int, want bool) {
				t.Helper()
				before := state()
				response := request(white, "easel.board.move", map[string]any{"from": from, "to": to, "revision": before["revision"]})
				if (response["message"] == nil) != want {
					t.Fatalf("move %d to %d accepted=%v: %v", from, to, want, response)
				}
				if !want && state()["revision"] != before["revision"] {
					t.Fatal("rejected move changed state")
				}
			}
			if application == "easel.chess.game" {
				for _, test := range []struct {
					kind     string
					from, to int
					blocker  int
					valid    bool
				}{
					{"rook", 56, 24, 40, false}, {"rook", 56, 24, -1, true}, {"rook", 56, 49, -1, false},
					{"bishop", 58, 37, -1, true}, {"bishop", 58, 37, 51, false}, {"bishop", 58, 42, -1, false},
					{"queen", 59, 32, -1, true}, {"queen", 59, 27, -1, true}, {"queen", 59, 42, -1, false},
					{"knight", 57, 40, 49, true}, {"knight", 57, 41, -1, false},
					{"king", 60, 52, -1, true}, {"king", 60, 44, -1, false},
					{"pawn", 52, 36, 44, false}, {"pawn", 52, 44, -1, true}, {"pawn", 52, 43, -1, false}, {"pawn", 44, 28, -1, false},
				} {
					pieces := map[int]string{test.from: "white " + test.kind}
					if test.blocker >= 0 {
						pieces[test.blocker] = "white pawn"
					}
					fixture(pieces)
					tryMove(test.from, test.to, test.valid)
				}
				fixture(map[int]string{52: "white pawn", 43: "black rook"})
				tryMove(52, 43, true)
			} else {
				fixture(map[int]string{40: "white checker", 33: "black checker", 19: "black checker", 42: "white checker"})
				tryMove(42, 35, false)
				tryMove(40, 26, true)
				if state()["turn"] != "white" || state()["chain"] != float64(26) {
					t.Fatal("multiple jump did not retain turn")
				}
				tryMove(42, 35, false)
				tryMove(26, 12, true)
				if state()["winner"] != "white" {
					t.Fatal("last capture did not win")
				}
				fixture(map[int]string{17: "white checker", 10: "black checker", 12: "black checker"})
				tryMove(17, 3, true)
				if state()["squares"].([]any)[3].(map[string]any)["kind"] != "king" || state()["turn"] != "black" {
					t.Fatal("crowning should end turn")
				}
				fixture(map[int]string{35: "white checker", 1: "black checker"})
				tryMove(35, 42, false)
				fixture(map[int]string{35: "white king", 1: "black checker"})
				tryMove(35, 42, true)
				fixture(map[int]string{17: "white checker", 56: "black checker"})
				tryMove(17, 8, true)
				if state()["winner"] != "white" {
					t.Fatal("blocked opponent did not lose")
				}
			}
			if got := request(black, "easel.board.reset", map[string]any{}); got["message"] == nil {
				t.Fatal("player reset match")
			}
			if got := request(white, "easel.board.reset", map[string]any{}); got["message"] != nil {
				t.Fatal(got)
			}
			if len(state()["history"].([]any)) != 0 || state()["seats"].(map[string]any)["white"] != "" {
				t.Fatal("reset did not clear match")
			}
		})
	}
}

func TestBoardBrowser(t *testing.T) {
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
	command := exec.CommandContext(ctx, "node", "../../scripts/test-board-browser.mjs", site.URL)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("browser: %v\n%s", err, output)
	} else {
		t.Log(string(output))
	}
}
