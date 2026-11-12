package session

import (
	"context"
	"encoding/json"

	"easel/internal/events"
	"easel/internal/manifest"
	"easel/internal/security"
)

type ClientRuntime interface {
	Runtime
	ClientPlan() manifest.Plan
	EmitAuthorizedClient(context.Context, string, json.RawMessage) error
	SubscribeClient(context.Context, string, func(json.RawMessage)) (func(), error)
	DeliverServerEvent(eventName string, payload json.RawMessage) error
}

func (s *session) ClientPlan() manifest.Plan { return s.plan }

func (s *session) EmitAuthorizedClient(ctx context.Context, name string, payload json.RawMessage) error {
	payload = append(json.RawMessage(nil), payload...)
	_, err := s.submit(ctx, events.Client, "client transport", func() (json.RawMessage, error) {
		if err := s.engine.CheckSubscription(name, nil); err != nil {
			return nil, err
		}
		if s.authorizeClient == nil {
			return nil, security.ErrDenied
		}
		if err := s.authorizeClient(s.bridge.Context(), name, payload, false); err != nil {
			return nil, err
		}
		return nil, s.engine.Emit(s.bridge.Context(), events.Client, name, payload)
	})
	return err
}

func (s *session) SubscribeClient(ctx context.Context, name string, deliver func(json.RawMessage)) (func(), error) {
	var off func()
	_, err := s.submit(ctx, events.Client, "client subscription", func() (json.RawMessage, error) {
		if s.authorizeClient == nil {
			return nil, security.ErrDenied
		}
		if err := s.authorizeClient(s.bridge.Context(), name, nil, true); err != nil {
			return nil, err
		}
		deliveryContext, err := security.WithExecution(ctx, security.Execution(s.bridge.Context()))
		if err != nil {
			return nil, err
		}
		off, err = s.engine.Listen("client delivery", name, func(_ context.Context, payload json.RawMessage) error {
			s.bridge.DeliverAfterCommit(func() error {
				if ctx.Err() == nil && s.authorizeClient(deliveryContext, name, payload, true) == nil {
					deliver(payload)
				}
				return nil
			})
			return nil
		})
		return nil, err
	})
	if err != nil {
		return nil, err
	}
	return func() {
		_, _ = s.submit(context.Background(), events.Client, "client unsubscribe", func() (json.RawMessage, error) { off(); return nil, nil })
	}, nil
}

func (s *session) DeliverServerEvent(eventName string, payload json.RawMessage) error {
	payload = append(json.RawMessage(nil), payload...)
	_, err := s.submit(context.Background(), events.Server, "server event", func() (json.RawMessage, error) {
		return nil, s.bridge.DeliverServerEvent(eventName, payload)
	})
	return err
}
