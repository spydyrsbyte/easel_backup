package server

import (
	"context"
	"sync"

	"easel/internal/accounts"
	"easel/internal/games"
	"easel/internal/jsapi"
	"easel/internal/security"
	"easel/internal/session"
)

type GameRouter interface {
	Server() *ClientGame
	Connect(ctx context.Context, event string, connection *jsapi.Connection) error
	Join(ctx context.Context, user accounts.User, id string) (*ClientGame, error)
	GamesFor(ctx context.Context, user accounts.User) []*ClientGame
}

type ServerRouter struct {
	Games       *games.Manager
	Application session.ServerRuntime

	server  *ClientGame
	mu      sync.Mutex
	clients map[string]*ClientGame
}

func signedIn(_ context.Context, user accounts.User) error {
	if user.ID == "" {
		return security.ErrDenied
	}
	return nil
}

func NewServerRouter(manager *games.Manager, application session.ServerRuntime) (*ServerRouter, error) {
	server, err := NewClientGame(application, signedIn)
	if err != nil {
		return nil, err
	}
	return &ServerRouter{Games: manager, Application: application, server: server}, nil
}

func (r *ServerRouter) Server() *ClientGame { return r.server }

func (r *ServerRouter) client(id string, runtime session.ClientRuntime) (*ClientGame, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.clients == nil {
		r.clients = map[string]*ClientGame{}
	}
	if cached := r.clients[id]; cached != nil && cached.Runtime == runtime {
		return cached, nil
	}
	game, err := NewClientGame(runtime, func(ctx context.Context, user accounts.User) error {
		member, err := r.Games.IsMember(ctx, id, user.ID)
		if err != nil {
			return err
		}
		if !member {
			return security.ErrDenied
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	game.ID = id
	game.Departure = func(userID string) (<-chan struct{}, func()) { return r.Games.Departure(id, userID) }
	r.clients[id] = game
	return game, nil
}

func (r *ServerRouter) Connect(ctx context.Context, event string, connection *jsapi.Connection) error {
	return r.Application.Connect(ctx, event, connection)
}

func (r *ServerRouter) Join(ctx context.Context, user accounts.User, id string) (*ClientGame, error) {
	runtime, running := r.Games.Runtime(id)
	if !running {
		return nil, games.ErrNotRunning
	}
	if err := r.Games.Join(ctx, id, user); err != nil {
		return nil, err
	}
	return r.client(id, runtime)
}

func (r *ServerRouter) GamesFor(ctx context.Context, user accounts.User) []*ClientGame {
	found := []*ClientGame{}
	if r.server != nil && user.ID != "" {
		found = append(found, r.server)
	}
	for id, runtime := range r.Games.Running() {
		if member, err := r.Games.IsMember(ctx, id, user.ID); err != nil || !member {
			continue
		}
		if game, err := r.client(id, runtime); err == nil {
			found = append(found, game)
		}
	}
	return found
}
