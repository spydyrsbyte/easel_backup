package games

import (
	"context"
	"encoding/json"

	"easel/internal/jsapi"
)

type scriptedGames struct{ manager *Manager }

func (m *Manager) Scripting() jsapi.ServerGames { return scriptedGames{m} }

func (s scriptedGames) Create(ctx context.Context, name, application string, modules []string, access string) (any, error) {
	return s.manager.Create(ctx, name, application, modules, access)
}

func (s scriptedGames) List(ctx context.Context) (any, error) { return s.manager.List(ctx) }

func (s scriptedGames) Get(ctx context.Context, id string) (any, error) {
	return s.manager.Get(ctx, id)
}

func (s scriptedGames) SetAccess(ctx context.Context, id, access string) error {
	return s.manager.SetAccess(ctx, id, access)
}

func (s scriptedGames) Start(ctx context.Context, id string) error { return s.manager.Start(ctx, id) }

func (s scriptedGames) Stop(id string) error { return s.manager.Stop(id) }

func (s scriptedGames) Delete(ctx context.Context, id string) error {
	return s.manager.Delete(ctx, id)
}

func (s scriptedGames) AddMember(ctx context.Context, id, userID string) error {
	return s.manager.AddMember(ctx, id, userID)
}

func (s scriptedGames) Members(ctx context.Context, id string) (any, error) {
	return s.manager.Members(ctx, id)
}

func (s scriptedGames) Remove(ctx context.Context, id, userID string) error {
	return s.manager.Remove(ctx, id, userID)
}

func (s scriptedGames) Installed() any { return s.manager.catalog().Installed() }

func (s scriptedGames) OnEvent(eventName string, handler func(gameID string, payload json.RawMessage)) {
	s.manager.OnGameEvent(eventName, handler)
}

func (s scriptedGames) EmitEvent(eventName string, payload json.RawMessage, targetID string) error {
	return s.manager.EmitToGames(eventName, payload, targetID)
}
