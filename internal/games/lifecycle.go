package games

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"easel/internal/session"
)

const (
	Automatic = "auto"
	Stopped   = "stopped"
	Suspended = "suspended"
	Relocated = "relocated"
)

var ErrRelocated = errors.New("this game was relocated to another installation; release it before starting it here")

type Occupant struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type LimitError struct {
	Max     int
	Running []Occupant
}

func (e *LimitError) Error() string {
	names := make([]string, len(e.Running))
	for index, game := range e.Running {
		names[index] = fmt.Sprintf("%q", game.Name)
	}
	if e.Max == 1 {
		return fmt.Sprintf("this edition of Easel runs one game at a time, and %s is running; stop or suspend it first", strings.Join(names, ", "))
	}
	return fmt.Sprintf("this edition of Easel runs %d games at a time, and %s are running; stop or suspend one first", e.Max, strings.Join(names, ", "))
}

type Slots struct {
	Max int

	mu   sync.Mutex
	held map[string]string
}

func (s *Slots) acquire(id, name string) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.held == nil {
		s.held = map[string]string{}
	}
	if _, held := s.held[id]; !held && s.Max > 0 && len(s.held) >= s.Max {
		return &LimitError{Max: s.Max, Running: s.occupants()}
	}
	s.held[id] = name
	return nil
}

func (s *Slots) release(id string) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.held, id)
}

func (s *Slots) occupants() []Occupant {
	running := make([]Occupant, 0, len(s.held))
	for id, name := range s.held {
		running = append(running, Occupant{ID: id, Name: name})
	}
	sort.Slice(running, func(a, b int) bool { return running[a].Name < running[b].Name })
	return running
}

type Limit struct {
	Max     int        `json:"max"`
	Running []Occupant `json:"running"`
}

func (m *Manager) Limit() Limit {
	if m.Slots == nil {
		return Limit{Running: []Occupant{}}
	}
	m.Slots.mu.Lock()
	defer m.Slots.mu.Unlock()
	return Limit{Max: m.Slots.Max, Running: m.Slots.occupants()}
}

func (m *Manager) scheduled(ctx context.Context, id string) ([]session.ScheduledEvent, error) {
	rows, err := m.Pool.Query(ctx, `SELECT name,payload::text,remaining_ms FROM game_data.scheduled_events WHERE game_id=$1 ORDER BY remaining_ms,schedule_id`, id)
	if err != nil {
		return nil, fmt.Errorf("read scheduled events: %w", err)
	}
	defer rows.Close()
	events := []session.ScheduledEvent{}
	for rows.Next() {
		var name, payload string
		var remaining int64
		if err := rows.Scan(&name, &payload, &remaining); err != nil {
			return nil, err
		}
		events = append(events, session.ScheduledEvent{Name: name, Payload: json.RawMessage(payload), Remaining: time.Duration(remaining) * time.Millisecond})
	}
	return events, rows.Err()
}

func (m *Manager) settle(ctx context.Context, id, lifecycle string, events []session.ScheduledEvent) error {
	tx, err := m.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `DELETE FROM game_data.scheduled_events WHERE game_id=$1`, id); err != nil {
		return err
	}
	for _, event := range events {
		payload := string(event.Payload)
		if payload == "" {
			payload = "{}"
		}
		if _, err := tx.Exec(ctx, `INSERT INTO game_data.scheduled_events(game_id,owner,name,payload,remaining_ms) VALUES($1,'',$2,$3::jsonb,$4)`, id, event.Name, payload, event.Remaining.Milliseconds()); err != nil {
			return err
		}
	}
	if lifecycle != "" {
		if _, err := tx.Exec(ctx, `UPDATE game_data.games SET lifecycle=$2,suspended_at=CASE WHEN $2='suspended' THEN now() END WHERE game_id=$1`, id, lifecycle); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (m *Manager) halt(id, lifecycle string, keepEvents bool) error {
	m.mu.Lock()
	game := m.running[id]
	delete(m.running, id)
	m.mu.Unlock()
	if game == nil {
		return ErrNotRunning
	}
	for _, watchers := range game.departure {
		for departed := range watchers {
			close(departed)
		}
	}
	events := game.runtime.HoldEvents()
	err := game.runtime.Close()
	if !keepEvents {
		events = nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if settled := m.settle(ctx, id, lifecycle, events); err == nil && settled != nil {
		err = fmt.Errorf("record the state of game %s: %w", id, settled)
	}
	m.Slots.release(id)
	if game.release != nil {
		game.release()
	}
	return err
}

func (m *Manager) Stop(id string) error { return m.halt(id, Stopped, false) }

func (m *Manager) Suspend(_ context.Context, id string) error { return m.halt(id, Suspended, true) }

func (m *Manager) setLifecycle(ctx context.Context, id, from, to string) error {
	if _, err := m.Get(ctx, id); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.running[id] != nil {
		return ErrRunning
	}
	changed, err := m.Pool.Exec(ctx, `UPDATE game_data.games SET lifecycle=$2,suspended_at=NULL WHERE game_id=$1 AND ($3='' OR lifecycle=$3)`, id, to, from)
	if err != nil {
		return err
	}
	if changed.RowsAffected() != 1 {
		return fmt.Errorf("game is not %s", from)
	}
	return nil
}

func (m *Manager) MarkRelocated(ctx context.Context, id string) error {
	return m.setLifecycle(ctx, id, "", Relocated)
}

func (m *Manager) Release(ctx context.Context, id string) error {
	return m.setLifecycle(ctx, id, Relocated, Stopped)
}

func (m *Manager) StartAutomatic(ctx context.Context) map[string]error {
	failed := map[string]error{}
	listed, err := m.List(ctx)
	if err != nil {
		failed[""] = err
		return failed
	}
	for _, game := range listed {
		if game.Lifecycle != Automatic || game.Running {
			continue
		}
		if err := m.Start(ctx, game.ID); err != nil {
			failed[game.ID] = fmt.Errorf("%s: %w", game.Name, err)
		}
	}
	return failed
}

func (s scriptedGames) Suspend(ctx context.Context, id string) error {
	return s.manager.Suspend(ctx, id)
}
func (s scriptedGames) Limit() any { return s.manager.Limit() }
func (s scriptedGames) StartAutomatic(ctx context.Context) any {
	failures := []map[string]string{}
	for id, err := range s.manager.StartAutomatic(ctx) {
		failures = append(failures, map[string]string{"game": id, "error": err.Error()})
	}
	return failures
}
