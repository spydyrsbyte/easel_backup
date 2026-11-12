package session

import (
	"context"
	"easel/internal/events"
	"encoding/json"
	"sort"
	"time"
)

type ScheduledEvent struct {
	Name      string
	Payload   json.RawMessage
	Remaining time.Duration
}

type scheduled struct {
	timer    *time.Timer
	name     string
	payload  json.RawMessage
	deadline time.Time
}

func (s *session) schedule(delay time.Duration, name string, payload json.RawMessage) int64 {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()
	if s.timers == nil {
		s.timers = map[int64]*scheduled{}
	}
	s.nextTimer++
	id := s.nextTimer
	entry := &scheduled{name: name, payload: append(json.RawMessage(nil), payload...), deadline: time.Now().Add(delay)}
	if s.timersHeld {
		s.timers[id] = entry
		return id
	}
	entry.timer = time.AfterFunc(delay, func() {
		_, _ = s.submit(context.Background(), events.Server, "scheduled event", func() (json.RawMessage, error) {
			s.timerMu.Lock()
			_, active := s.timers[id]
			delete(s.timers, id)
			s.timerMu.Unlock()
			if !active {
				return nil, nil
			}
			return nil, s.engine.Emit(s.bridge.Context(), events.Server, name, payload)
		})
	})
	s.timers[id] = entry
	return id
}

func (s *session) cancelTimer(id int64) {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()
	if entry := s.timers[id]; entry != nil {
		if entry.timer != nil {
			entry.timer.Stop()
		}
		delete(s.timers, id)
	}
}

func (s *session) stopTimers() {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()
	s.timersHeld = true
	for _, entry := range s.timers {
		if entry.timer != nil {
			entry.timer.Stop()
		}
	}
}

func (s *session) PendingEvents() []ScheduledEvent {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()
	ids := make([]int64, 0, len(s.timers))
	for id := range s.timers {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(a, b int) bool { return ids[a] < ids[b] })
	now := time.Now()
	pending := make([]ScheduledEvent, 0, len(ids))
	for _, id := range ids {
		entry := s.timers[id]
		remaining := entry.deadline.Sub(now)
		if remaining < 0 {
			remaining = 0
		}
		pending = append(pending, ScheduledEvent{Name: entry.name, Payload: append(json.RawMessage(nil), entry.payload...), Remaining: remaining})
	}
	return pending
}

func (s *session) HoldEvents() []ScheduledEvent {
	s.stopTimers()
	return s.PendingEvents()
}
