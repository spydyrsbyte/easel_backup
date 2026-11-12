package games

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"easel/internal/database/dbtest"
	"easel/internal/manifest"
	"easel/internal/platform"
	"github.com/jackc/pgx/v5/pgxpool"
)

const timerGame = `
Application.events.register("acme.timer.tick", { valid: 1 });
Application.events.on("acme.timer.tick", () => { new acme.timer.Mark().save(); });
export function handleMessage(message) {
  if (message.op === "schedule") { Server.events.after("acme.timer.tick", message.delay, {}); return true; }
  return acme.timer.Mark.ids().length;
}
`

func timerCatalog(t *testing.T) *platform.Catalog {
	t.Helper()
	app, err := manifest.Load(fstest.MapFS{
		manifest.FileName: {Data: []byte(`{"type":"application","owner":"acme","host":"timer","name":"game","server":{"application":{"entry":"main.mjs"},"data":[{".name":"Mark","hit":{".type":"boolean",".default":true}}]}}`)},
		"main.mjs":        {Data: []byte(timerGame)},
	})
	if err != nil {
		t.Fatal(err)
	}
	return &platform.Catalog{Applications: map[string]manifest.Package{app.ID(): app}, Modules: map[string]manifest.Package{}}
}

func timerManager(t *testing.T, pool *pgxpool.Pool, folder string, slots *Slots) *Manager {
	t.Helper()
	manager := &Manager{Pool: pool, Catalog: timerCatalog(t), Folder: folder, Slots: slots}
	t.Cleanup(manager.Close)
	return manager
}

func ask(t *testing.T, manager *Manager, id, message string) string {
	t.Helper()
	runtime, running := manager.Runtime(id)
	if !running {
		t.Fatal("game is not running")
	}
	data, err := runtime.Dispatch(context.Background(), json.RawMessage(message))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func lifecycleOf(t *testing.T, manager *Manager, id string) string {
	t.Helper()
	game, err := manager.Get(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return game.Lifecycle
}

func TestSuspendedGamesKeepTheirTimersAndReleaseTheirSlot(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	folder := t.TempDir()
	slots := &Slots{Max: 1}
	manager := timerManager(t, pool, folder, slots)
	create := func(name string) Game {
		game, err := manager.Create(ctx, name, "acme.timer.game", nil, Open)
		if err != nil {
			t.Fatal(err)
		}
		return game
	}
	first, second, third := create("First"), create("Second"), create("Third")
	if err := manager.Start(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	var limit *LimitError
	if err := manager.Start(ctx, second.ID); !errors.As(err, &limit) || limit.Max != 1 || len(limit.Running) != 1 || limit.Running[0].ID != first.ID || !strings.Contains(err.Error(), `"First"`) {
		t.Fatalf("a second game started under a one-game limit: %v", err)
	}
	if occupied := manager.Limit(); occupied.Max != 1 || len(occupied.Running) != 1 || occupied.Running[0].Name != "First" {
		t.Fatalf("limit report: %+v", occupied)
	}
	ask(t, manager, first.ID, `{"op":"schedule","delay":700}`)
	if err := manager.Suspend(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if lifecycleOf(t, manager, first.ID) != Suspended {
		t.Fatal("a suspended game is not recorded as suspended")
	}
	var remaining int64
	if err := pool.QueryRow(ctx, `SELECT remaining_ms FROM game_data.scheduled_events WHERE game_id=$1`, first.ID).Scan(&remaining); err != nil || remaining <= 0 || remaining > 700 {
		t.Fatalf("the pending event was not kept: %d %v", remaining, err)
	}
	if err := manager.Start(ctx, second.ID); err != nil {
		t.Fatalf("suspending did not release the slot: %v", err)
	}
	time.Sleep(900 * time.Millisecond)
	if err := manager.Start(ctx, first.ID); !errors.As(err, &limit) {
		t.Fatalf("resuming ignored the limit: %v", err)
	}
	if err := manager.Stop(second.ID); err != nil {
		t.Fatal(err)
	}
	if lifecycleOf(t, manager, second.ID) != Stopped {
		t.Fatal("a stopped game is not recorded as stopped")
	}
	if err := manager.Start(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if fired := ask(t, manager, first.ID, `{"op":"count"}`); fired != "0" {
		t.Fatalf("the timer ran while the game was suspended: %s", fired)
	}
	deadline := time.Now().Add(3 * time.Second)
	for ask(t, manager, first.ID, `{"op":"count"}`) != "1" {
		if time.Now().After(deadline) {
			t.Fatal("the kept timer never fired after resuming")
		}
		time.Sleep(50 * time.Millisecond)
	}
	var kept int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM game_data.scheduled_events WHERE game_id=$1`, first.ID).Scan(&kept); err != nil || kept != 0 {
		t.Fatalf("restored events were kept in storage: %d %v", kept, err)
	}
	if err := manager.Stop(first.ID); err != nil {
		t.Fatal(err)
	}

	outcomes := make(chan error, 2)
	var wait sync.WaitGroup
	for _, game := range []Game{second, third} {
		wait.Add(1)
		go func(id string) {
			defer wait.Done()
			outcomes <- manager.Start(ctx, id)
		}(game.ID)
	}
	wait.Wait()
	close(outcomes)
	started, refused := 0, 0
	for err := range outcomes {
		switch {
		case err == nil:
			started++
		case errors.As(err, &limit):
			refused++
		default:
			t.Fatal(err)
		}
	}
	if started != 1 || refused != 1 || len(manager.Running()) != 1 {
		t.Fatalf("simultaneous starts: %d started, %d refused, %d running", started, refused, len(manager.Running()))
	}
	if err := manager.MarkRelocated(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	for id := range manager.Running() {
		if err := manager.Stop(id); err != nil {
			t.Fatal(err)
		}
	}
	if err := manager.Start(ctx, first.ID); !errors.Is(err, ErrRelocated) {
		t.Fatalf("a relocated game started: %v", err)
	}
	if err := manager.Release(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
}

func TestGamesRecoverAfterTheProcessRestarts(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	folder := t.TempDir()
	manager := timerManager(t, pool, folder, nil)
	create := func(name string) Game {
		game, err := manager.Create(ctx, name, "acme.timer.game", nil, Open)
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.Start(ctx, game.ID); err != nil {
			t.Fatal(err)
		}
		return game
	}
	running, stopped, suspended := create("Running"), create("Stopped"), create("Suspended")
	ask(t, manager, running.ID, `{"op":"schedule","delay":600}`)
	if err := manager.Stop(stopped.ID); err != nil {
		t.Fatal(err)
	}
	if err := manager.Suspend(ctx, suspended.ID); err != nil {
		t.Fatal(err)
	}
	manager.Close()
	if lifecycleOf(t, manager, running.ID) != Automatic {
		t.Fatal("shutting down changed the startup choice of a running game")
	}
	time.Sleep(800 * time.Millisecond)

	restarted := timerManager(t, pool, folder, &Slots{Max: 1})
	if failed := restarted.StartAutomatic(ctx); len(failed) != 0 {
		t.Fatalf("automatic start: %v", failed)
	}
	active := restarted.Running()
	if len(active) != 1 || active[running.ID] == nil {
		t.Fatalf("games running after restart: %d", len(active))
	}
	if lifecycleOf(t, restarted, stopped.ID) != Stopped || lifecycleOf(t, restarted, suspended.ID) != Suspended {
		t.Fatal("startup choices were lost")
	}
	if fired := ask(t, restarted, running.ID, `{"op":"count"}`); fired != "0" {
		t.Fatalf("the timer ran while Easel was down: %s", fired)
	}
	deadline := time.Now().Add(3 * time.Second)
	for ask(t, restarted, running.ID, `{"op":"count"}`) != "1" {
		if time.Now().After(deadline) {
			t.Fatal("the timer kept across the restart never fired")
		}
		time.Sleep(50 * time.Millisecond)
	}
	if err := restarted.Suspend(ctx, running.ID); err != nil {
		t.Fatal(err)
	}
	if err := restarted.Start(ctx, suspended.ID); err != nil {
		t.Fatal(err)
	}
	if failed := restarted.StartAutomatic(ctx); len(failed) != 0 || len(restarted.Running()) != 1 {
		t.Fatalf("automatic start resumed a suspended game: %v", failed)
	}
}
