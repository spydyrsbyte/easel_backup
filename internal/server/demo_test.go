package server

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	"easel/internal/accounts"
	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/security"
	"easel/internal/session"
)

func NewDemoGame(ctx context.Context, dataDir string, globals []manifest.Package) (*ClientGame, error) {
	packages := []manifest.Package{}
	for _, directory := range []string{"modules/ui", "modules/table-style", "applications/demo"} {
		p, err := manifest.Load(os.DirFS(filepath.Join(dataDir, directory)))
		if err != nil {
			return nil, err
		}
		packages = append(packages, p)
	}
	runtime, err := session.NewGame(ctx, session.Game{GameID: "demo", SessionID: "demo", Packages: packages, Globals: globals, AuthorizeClient: func(ctx context.Context, name string, payload json.RawMessage, delivery bool) error {
		if security.Principal(ctx) == "" {
			return security.ErrDenied
		}
		if delivery && name == "easel.demo.result" || !delivery && name == "easel.demo.roll" {
			return nil
		}
		return security.ErrDenied
	}})
	if err != nil {
		return nil, err
	}
	g, err := NewClientGame(runtime.(session.ClientRuntime), func(ctx context.Context, user accounts.User) error {
		if user.ID == "" {
			return security.ErrDenied
		}
		return nil
	})
	if err != nil {
		runtime.Close()
		return nil, err
	}
	return g, nil
}

type singleGame struct{ game *ClientGame }

func SingleGame(game *ClientGame) GameRouter { return singleGame{game} }

func (s singleGame) Server() *ClientGame { return nil }

func (s singleGame) Connect(_ context.Context, event string, connection *jsapi.Connection) error {
	if event == "signedIn" {
		return connection.Join("")
	}
	return nil
}

func (s singleGame) Join(context.Context, accounts.User, string) (*ClientGame, error) {
	return s.game, nil
}

func (s singleGame) GamesFor(ctx context.Context, user accounts.User) []*ClientGame {
	if s.game.Access(security.WithPrincipal(ctx, user.ID), user) != nil {
		return nil
	}
	return []*ClientGame{s.game}
}
