package games

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"easel/internal/automation"
	"easel/internal/automation/pgstore"
	"easel/internal/events"
	"easel/internal/files"
	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/platform"
	"easel/internal/schema"
	"easel/internal/security"
	"easel/internal/session"
	"github.com/jackc/pgx/v5"
)

type ServerHost struct {
	Users           jsapi.ServerUsers
	AuthorizeClient func(context.Context, string, json.RawMessage, bool) error
}

func (m *Manager) boot(ctx context.Context, id, name string, packages []manifest.Package, plan manifest.Plan, host *ServerHost) (session.Runtime, error) {
	composed := &schema.Schema{}
	revision, err := (&pgstore.Revisions{Pool: m.Pool}).CurrentRevision(ctx, id, plan, composed)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(m.folder(id), 0o755); err != nil {
		return nil, fmt.Errorf("create folder of %s: %w", name, err)
	}
	sessionID, err := newSessionID()
	if err != nil {
		return nil, err
	}
	store := &security.PostgresStore{Pool: m.Pool, GameID: id, ResolveRecord: security.RecordResolver(pgstore.RecordView)}
	service := &security.SecurityService{}
	records := &pgstore.Records{Pool: m.Pool, GameID: id, Schema: composed, IsDenied: func(err error) bool { return errors.Is(err, security.ErrDenied) }, AuthorizeRecord: func(ctx context.Context, tx pgx.Tx, action string, record automation.Record) error {
		if security.Execution(ctx).Origin == events.Server.String() {
			return nil
		}
		resource := record.ID
		if action == "create" {
			resource = "type:" + record.Type
		}
		return service.RequireIn(ctx, store.ViewTransaction(tx), security.AuthorizationRequest{ResourceID: resource, Action: action, Context: map[string]any{"record": record.Data}})
	}}
	automationRequest := func(action string, saved automation.Saved) (security.AuthorizationRequest, error) {
		return security.AuthorizationRequest{ResourceID: "type:" + security.UserType, Action: "automation." + action, Context: map[string]any{"name": saved.Definition.Name}}, nil
	}
	repository := &pgstore.Repository{Pool: m.Pool, GameID: id, AuthorizeWrite: func(ctx context.Context, tx pgx.Tx, action string, saved automation.Saved) error {
		if security.Execution(ctx).Origin == events.Server.String() && security.Principal(ctx) == "" && saved.Creator.Kind == automation.CreatorSystem {
			return nil
		}
		return security.ErrDenied
	}}
	access := hostedAutomationAccess{service: service, request: automationRequest}
	game := session.Game{
		GameID:            id,
		SessionID:         sessionID,
		Packages:          packages,
		Schema:            composed,
		Globals:           m.Globals,
		Security:          &jsapi.SecurityConfig{Service: service, Store: store, BuildID: revision},
		Records:           records,
		AutomationService: automation.New(repository, records, access),
		RecordType:        records.RecordType,
		Files:             m.fileService(id, host != nil),
	}
	if host != nil {
		game.Server = true
		game.Games = m.Scripting()
		game.Users = host.Users
		game.AuthorizeClient = host.AuthorizeClient
	} else {
		game.Members = func(ctx context.Context) (any, error) { return m.Roles(ctx, id) }
		game.AuthorizeClient = func(ctx context.Context, _ string, _ json.RawMessage, _ bool) error {
			member, err := m.IsMember(ctx, id, security.Principal(ctx))
			if err != nil {
				return err
			}
			if !member {
				return security.ErrDenied
			}
			return nil
		}
		game.EmitServerEvent = func(ctx context.Context, gameID string, eventName string, payload json.RawMessage) error {
			return m.HandleGameEvent(gameID, eventName, payload)
		}
	}
	runtime, err := session.NewGame(security.WithPrincipal(context.WithoutCancel(ctx), ""), game)
	if err != nil {
		return nil, fmt.Errorf("start %s: %w", name, err)
	}
	return runtime, nil
}

func (m *Manager) Start(ctx context.Context, id string) error {
	game, err := m.Get(ctx, id)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.running[id] != nil {
		return ErrRunning
	}
	packages, plan, err := m.resolveSaved(ctx, game)
	if err != nil {
		return err
	}
	runtime, err := m.boot(ctx, id, "game "+game.Name, packages, plan, nil)
	if err != nil {
		return err
	}
	client, ok := runtime.(session.ClientRuntime)
	if !ok {
		runtime.Close()
		return fmt.Errorf("game %s cannot serve clients", game.Name)
	}
	if m.running == nil {
		m.running = map[string]*runningGame{}
	}
	m.running[id] = &runningGame{runtime: client, departure: map[string]map[chan struct{}]bool{}}
	return nil
}

func (m *Manager) serverStorage(ctx context.Context, application manifest.Package) (string, error) {
	var id string
	err := m.Pool.QueryRow(ctx, `SELECT game_id::text FROM game_data.games WHERE kind='server' AND server_id=$1 AND name=$2`, m.server(), application.ID()).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("find storage of server application %s: %w", application.ID(), err)
	}
	return (&pgstore.Revisions{Pool: m.Pool}).CreateStorage(ctx, m.server(), "server", application.ID(), application)
}

func (m *Manager) StartServer(ctx context.Context, definition *platform.Definition, host ServerHost) (session.ServerRuntime, error) {
	packages := definition.Packages()
	plan, err := m.plan(packages)
	if err != nil {
		return nil, err
	}
	id, err := m.serverStorage(ctx, definition.Server)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	m.storage = id
	m.mu.Unlock()
	runtime, err := m.boot(ctx, id, "server application "+definition.Server.ID(), packages, plan, &host)
	if err != nil {
		return nil, err
	}
	server, ok := runtime.(session.ServerRuntime)
	if !ok {
		runtime.Close()
		return nil, fmt.Errorf("server application %s cannot serve clients", definition.Server.ID())
	}
	return server, nil
}

func (m *Manager) ServerStorage() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.storage
}

func (m *Manager) SyncServerPrincipal(ctx context.Context, userID string) error {
	storage := m.ServerStorage()
	if storage == "" || !validID(userID) {
		return nil
	}
	if _, err := m.Pool.Exec(ctx, `INSERT INTO game_data.security_principals(game_id,id,principal_type,attributes)
 SELECT $1,u.user_id,$3,jsonb_build_object('role',CASE WHEN a.user_id IS NULL THEN 'user' ELSE 'administrator' END)
 FROM accounts.users u LEFT JOIN accounts.administrators a USING(user_id) WHERE u.user_id=$2 AND u.server_id=$4
 ON CONFLICT (game_id,id) DO UPDATE SET attributes=game_data.security_principals.attributes||EXCLUDED.attributes`, storage, userID, security.UserType, m.server()); err != nil {
		return fmt.Errorf("record server principal: %w", err)
	}
	return nil
}

func (m *Manager) fileStore(id string) *files.Store {
	m.filesMu.Lock()
	defer m.filesMu.Unlock()
	if m.files == nil {
		m.files = map[string]*files.Store{}
	}
	if m.files[id] == nil {
		m.files[id] = &files.Store{Pool: m.Pool, GameID: id, Folder: filepath.Join(m.folder(id), "files"), MaxBytes: m.FileLimit, Types: m.FileTypes}
	}
	return m.files[id]
}

func (m *Manager) fileService(id string, server bool) *jsapi.FilesConfig {
	path := "/files/" + id
	if server {
		path = "/files/server"
	}
	return &jsapi.FilesConfig{Store: m.fileStore(id), Path: path}
}

func (m *Manager) Files(id string) *files.Store { return m.fileStore(id) }
