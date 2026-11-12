package games

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/fstest"

	"easel/internal/accounts"
	"easel/internal/database"
	"easel/internal/database/dbtest"
	"easel/internal/manifest"
	"easel/internal/platform"
	"easel/internal/security"
	"github.com/jackc/pgx/v5/pgxpool"
)

const tallySecurity = `
for (const action of ["read", "modify"]) {
  Security.registerAction("acme.tally.Total", action);
  Security.registerPolicy("tally." + action, { resource: "acme.tally.Total", action, allow: { always: true } });
}
`

const tallyGame = `
let id;
Application.events.register("acme.tally.add", { valid: 2, amount: "integer", fail: "boolean" });
Application.events.register("acme.tally.changed", { valid: 1, value: "integer" });
Server.events.on("Load.Data.Ready", () => {
  const ids = acme.tally.Total.ids();
  if (ids.length) { id = ids[0]; return; }
  const total = new acme.tally.Total();
  total.save();
  id = total.id;
});
Application.events.on("acme.tally.add", ({ amount, fail }) => {
  const total = new acme.tally.Total(id);
  total.value += amount;
  total.save();
  Application.events.emit("acme.tally.changed", { value: total.value });
  if (fail) throw new Error("declined");
});
export function handleMessage() { return new acme.tally.Total(id).value; }
`

func tallyCatalog(t testing.TB) *platform.Catalog {
	t.Helper()
	app, err := manifest.Load(fstest.MapFS{
		manifest.FileName: {Data: []byte(`{"type":"application","owner":"acme","host":"tally","name":"game","server":{"security":{"entry":"security.mjs"},"application":{"entry":"main.mjs"},"data":[{".name":"Total","value":{".type":"integer",".default":0}}]}}`)},
		"main.mjs":        {Data: []byte(tallyGame)},
		"security.mjs":    {Data: []byte(tallySecurity)},
	})
	if err != nil {
		t.Fatal(err)
	}
	return &platform.Catalog{Applications: map[string]manifest.Package{app.ID(): app}, Modules: map[string]manifest.Package{}}
}

type table struct {
	manager *Manager
	game    Game
	member  accounts.User
}

func tallyTables(t testing.TB, pool *pgxpool.Pool, servers, perServer int) []table {
	t.Helper()
	ctx := context.Background()
	tables := []table{}
	folder := t.TempDir()
	for index := 0; index < servers; index++ {
		id, err := database.EnsureServer(ctx, pool, fmt.Sprintf("server%d", index))
		if err != nil {
			t.Fatal(err)
		}
		manager := &Manager{Pool: pool, Catalog: tallyCatalog(t), Folder: folder, ServerID: id}
		t.Cleanup(manager.Close)
		service := &accounts.Service{Pool: pool, ServerID: id}
		for number := 0; number < perServer; number++ {
			game, err := manager.Create(ctx, fmt.Sprintf("Table %d", number), "acme.tally.game", nil, Open)
			if err != nil {
				t.Fatal(err)
			}
			member, err := service.SignUp(ctx, fmt.Sprintf("player%d", number), "correct horse", "")
			if err != nil {
				t.Fatal(err)
			}
			if err := manager.Join(ctx, game.ID, member); err != nil {
				t.Fatal(err)
			}
			if err := manager.Start(ctx, game.ID); err != nil {
				t.Fatal(err)
			}
			tables = append(tables, table{manager, game, member})
		}
	}
	return tables
}

func TestConcurrentGamesAndServersStayIsolated(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	tables := tallyTables(t, pool, 2, 4)
	const rounds = 150
	var wait sync.WaitGroup
	accepted := make([]atomic.Int64, len(tables))
	delivered := make([]atomic.Int64, len(tables))
	problems := make(chan error, len(tables)*rounds*2)
	for index, entry := range tables {
		runtime, _ := entry.manager.Runtime(entry.game.ID)
		member := security.WithPrincipal(ctx, entry.member.ID)
		position := index
		off, err := runtime.SubscribeClient(member, "acme.tally.changed", func(json.RawMessage) { delivered[position].Add(1) })
		if err != nil {
			t.Fatal(err)
		}
		defer off()
		outsider := security.WithPrincipal(ctx, tables[(index+1)%len(tables)].member.ID)
		for worker := 0; worker < 3; worker++ {
			wait.Add(1)
			go func(worker int) {
				defer wait.Done()
				for round := 0; round < rounds; round++ {
					amount := position + 1
					switch {
					case round%10 == 3:
						err := runtime.EmitAuthorizedClient(member, "acme.tally.add", json.RawMessage(fmt.Sprintf(`{"amount":%d,"fail":true}`, amount)))
						if err == nil || !strings.Contains(err.Error(), "declined") {
							problems <- fmt.Errorf("a failing request did not fail: %v", err)
						}
					case round%10 == 6:
						if err := runtime.EmitAuthorizedClient(outsider, "acme.tally.add", json.RawMessage(`{"amount":1000,"fail":false}`)); !errors.Is(err, security.ErrDenied) {
							problems <- fmt.Errorf("a member of another game was not denied: %v", err)
						}
					case round%10 == 8:
						cancelled, cancel := context.WithCancel(member)
						cancel()
						if err := runtime.EmitAuthorizedClient(cancelled, "acme.tally.add", json.RawMessage(`{"amount":1000,"fail":false}`)); err == nil {
							problems <- errors.New("a request from a closed connection was applied")
						}
					default:
						if err := runtime.EmitAuthorizedClient(member, "acme.tally.add", json.RawMessage(fmt.Sprintf(`{"amount":%d,"fail":false}`, amount))); err != nil {
							problems <- err
						} else {
							accepted[position].Add(int64(amount))
						}
					}
				}
			}(worker)
		}
	}
	wait.Wait()
	close(problems)
	for problem := range problems {
		t.Error(problem)
	}
	for index, entry := range tables {
		runtime, _ := entry.manager.Runtime(entry.game.ID)
		data, err := runtime.Dispatch(ctx, json.RawMessage(`{}`))
		if err != nil {
			t.Fatal(err)
		}
		if string(data) != fmt.Sprint(accepted[index].Load()) {
			t.Errorf("game %d holds %s, and its accepted requests add up to %d", index, data, accepted[index].Load())
		}
		if delivered[index].Load() != accepted[index].Load()/int64(index+1) {
			t.Errorf("game %d delivered %d events for %d committed requests", index, delivered[index].Load(), accepted[index].Load()/int64(index+1))
		}
	}
}
