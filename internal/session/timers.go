package session

import (
	"context"
	"easel/internal/events"
	"encoding/json"
	"time"
)

func (s *session) schedule(delay time.Duration, name string, payload json.RawMessage) int64 {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()
	if s.timers == nil {
		s.timers = map[int64]*time.Timer{}
	}
	s.nextTimer++
	id := s.nextTimer
	s.timers[id] = time.AfterFunc(delay, func() {
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
	return id
}

func (s *session) cancelTimer(id int64) {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()
	if timer := s.timers[id]; timer != nil {
		timer.Stop()
		delete(s.timers, id)
	}
}

func (s *session) stopTimers() {
	s.timerMu.Lock()
	defer s.timerMu.Unlock()
	for id, timer := range s.timers {
		timer.Stop()
		delete(s.timers, id)
	}
}
