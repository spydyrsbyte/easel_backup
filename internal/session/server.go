package session

import (
	"context"
	"encoding/json"

	"easel/internal/events"
	"easel/internal/jsapi"
)

type ServerRuntime interface {
	ClientRuntime
	Evaluate(context.Context, string, map[string]any) (jsapi.AuthDecision, error)
	Connect(context.Context, string, *jsapi.Connection) error
}

func (s *session) Evaluate(ctx context.Context, hook string, fields map[string]any) (jsapi.AuthDecision, error) {
	var decision jsapi.AuthDecision
	_, err := s.submit(ctx, events.Server, "easel.easel.server", func() (json.RawMessage, error) {
		var err error
		decision, err = s.bridge.Evaluate(s.bridge.Context(), hook, fields)
		return nil, err
	})
	return decision, err
}

func (s *session) Connect(ctx context.Context, event string, connection *jsapi.Connection) error {
	_, err := s.submit(ctx, events.Server, "easel.easel.server", func() (json.RawMessage, error) {
		return nil, s.bridge.Connect(s.bridge.Context(), event, connection)
	})
	return err
}
