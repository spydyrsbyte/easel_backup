package games

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"easel/internal/accounts"
	"easel/internal/automation"
	"easel/internal/automation/pgstore"
	"easel/internal/database"
	"easel/internal/events"
	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/platform"
	"easel/internal/schema"
	"easel/internal/security"
	"easel/internal/session"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	Open        = "open"
	MembersOnly = "invite"

	foreignKeyViolation = "23503"
)

var (
	ErrUnknownGame   = errors.New("game does not exist")
	ErrUnknownUser   = errors.New("user does not exist")
	ErrInvalidAccess = errors.New(`access must be "open" or "invite"`)
	ErrMembersOnly   = errors.New("this table is for members only; ask a table administrator to add you")
	ErrNotRunning    = errors.New("game is not running")
	ErrRunning       = errors.New("game is already running")
)

type Game struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Application string   `json:"application"`
	Modules     []string `json:"modules"`
	Access      string   `json:"access"`
	Running     bool     `json:"running"`
}

type Manager struct {
	Pool    *pgxpool.Pool
	Catalog *platform.Catalog
	Globals []manifest.Package
	Folder  string

	mu                 sync.Mutex
	running            map[string]*runningGame
	gameEventListeners map[string][]func(gameID string, payload json.RawMessage)
}

type runningGame struct {
	runtime   session.ClientRuntime
	departure map[string]map[chan struct{}]bool
}

func validAccess(access string) error {
	if access != Open && access != MembersOnly {
		return ErrInvalidAccess
	}
	return nil
}

func (m *Manager) resolve(application string, modules []string) ([]manifest.Package, manifest.Plan, error) {
	packages, err := m.Catalog.Packages(application, modules)
	if err != nil {
		return nil, manifest.Plan{}, err
	}
	listed := map[string]bool{}
	for _, pkg := range packages {
		listed[pkg.ID()] = true
	}
	all := append([]manifest.Package(nil), packages...)
	for _, pkg := range m.Globals {
		if !listed[pkg.ID()] {
			listed[pkg.ID()] = true
			all = append(all, pkg)
		}
		for _, dep := range pkg.Dependencies {
			if !listed[dep.ID()] {
				listed[dep.ID()] = true
				all = append(all, dep)
			}
		}
	}
	plan, err := manifest.Resolve(all)
	if err != nil {
		return nil, manifest.Plan{}, fmt.Errorf("resolve packages: %w", err)
	}
	return packages, plan, nil
}

func (m *Manager) compose(application string, modules []string) ([]manifest.Package, manifest.Plan, *schema.Schema, error) {
	packages, plan, err := m.resolve(application, modules)
	if err != nil {
		return nil, manifest.Plan{}, nil, err
	}
	composed, err := schema.Compose(plan.Packages)
	if err != nil {
		return nil, manifest.Plan{}, nil, fmt.Errorf("compose data schema: %w", err)
	}
	return packages, plan, composed, nil
}

func (m *Manager) folder(id string) string { return filepath.Join(m.Folder, id) }

func (m *Manager) Create(ctx context.Context, name, application string, modules []string, access string) (Game, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Game{}, fmt.Errorf("a game needs a name")
	}
	if err := validAccess(access); err != nil {
		return Game{}, err
	}
	if modules == nil {
		modules = []string{}
	}
	packages, plan, composed, err := m.compose(application, modules)
	if err != nil {
		return Game{}, err
	}
	revisions := &pgstore.Revisions{Pool: m.Pool}
	id, err := revisions.CreateGame(ctx, name, packages[0])
	if err != nil {
		return Game{}, err
	}
	if _, err := m.Pool.Exec(ctx, `UPDATE game_data.games SET access=$2,modules=$3 WHERE game_id=$1`, id, access, modules); err != nil {
		return Game{}, fmt.Errorf("store settings of game %s: %w", name, err)
	}
	if _, err := revisions.Publish(ctx, id, plan, composed); err != nil {
		return Game{}, err
	}
	if principal := security.Principal(ctx); principal != "" {
		if _, err := m.Pool.Exec(ctx, `INSERT INTO game_data.members(game_id,user_id) VALUES($1,$2);`, id, principal); err != nil {
			return Game{}, err
		}
		if _, err := m.Pool.Exec(ctx, `INSERT INTO game_data.security_principals(game_id,id,principal_type,attributes) VALUES($1,$2,$3,'{"role":"administrator"}')`, id, principal, security.UserType); err != nil {
			return Game{}, err
		}
	}
	if err := os.MkdirAll(m.folder(id), 0o755); err != nil {
		return Game{}, fmt.Errorf("create folder of game %s: %w", name, err)
	}
	return m.Get(ctx, id)
}

const selectGames = `SELECT g.game_id::text,g.name,c.name,g.modules,g.access FROM game_data.games g JOIN game_data.contributors c ON c.game_id=g.game_id AND c.contributor_id=g.application_id`

func (m *Manager) scan(rows pgx.Rows) ([]Game, error) {
	defer rows.Close()
	found := []Game{}
	for rows.Next() {
		var game Game
		if err := rows.Scan(&game.ID, &game.Name, &game.Application, &game.Modules, &game.Access); err != nil {
			return nil, fmt.Errorf("read game: %w", err)
		}
		_, game.Running = m.runtime(game.ID)
		found = append(found, game)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list games: %w", err)
	}
	return found, nil
}

func (m *Manager) List(ctx context.Context) ([]Game, error) {
	rows, err := m.Pool.Query(ctx, selectGames+` ORDER BY g.created_at,g.game_id`)
	if err != nil {
		return nil, fmt.Errorf("list games: %w", err)
	}
	return m.scan(rows)
}

func (m *Manager) Get(ctx context.Context, id string) (Game, error) {
	if !validID(id) {
		return Game{}, ErrUnknownGame
	}
	rows, err := m.Pool.Query(ctx, selectGames+` WHERE g.game_id=$1`, id)
	if err != nil {
		return Game{}, fmt.Errorf("read game %s: %w", id, err)
	}
	found, err := m.scan(rows)
	if err != nil {
		return Game{}, err
	}
	if len(found) == 0 {
		return Game{}, ErrUnknownGame
	}
	return found[0], nil
}

func validID(id string) bool {
	if len(id) != 36 {
		return false
	}
	for i, r := range id {
		switch {
		case i == 8 || i == 13 || i == 18 || i == 23:
			if r != '-' {
				return false
			}
		case (r < '0' || r > '9') && (r < 'a' || r > 'f') && (r < 'A' || r > 'F'):
			return false
		}
	}
	return true
}

func (m *Manager) SetAccess(ctx context.Context, id, access string) error {
	if err := validAccess(access); err != nil {
		return err
	}
	if !validID(id) {
		return ErrUnknownGame
	}
	command, err := m.Pool.Exec(ctx, `UPDATE game_data.games SET access=$2 WHERE game_id=$1`, id, access)
	if err != nil {
		return fmt.Errorf("set access of game %s: %w", id, err)
	}
	if command.RowsAffected() == 0 {
		return ErrUnknownGame
	}
	return nil
}

func newSessionID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate session id: %w", err)
	}
	return hex.EncodeToString(raw), nil
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
	composed := &schema.Schema{}
	revision, err := (&pgstore.Revisions{Pool: m.Pool}).CurrentRevision(ctx, id, plan, composed)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(m.folder(id), 0o755); err != nil {
		return fmt.Errorf("create folder of game %s: %w", game.Name, err)
	}
	sessionID, err := newSessionID()
	if err != nil {
		return err
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
	authorizeClient := func(ctx context.Context, _ string, _ json.RawMessage, _ bool) error {
		member, err := m.IsMember(ctx, id, security.Principal(ctx))
		if err != nil {
			return err
		}
		if !member {
			return security.ErrDenied
		}
		return nil
	}
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
	runtime, err := session.NewGame(security.WithPrincipal(context.WithoutCancel(ctx), ""), session.Game{
		GameID:            id,
		SessionID:         sessionID,
		Packages:          packages,
		Schema:            composed,
		Globals:           m.Globals,
		Security:          &jsapi.SecurityConfig{Service: service, Store: store, BuildID: revision},
		Records:           records,
		Members:           func(ctx context.Context) (any, error) { return m.Roles(ctx, id) },
		AutomationService: automation.New(repository, records, access),
		RecordType:        records.RecordType,
		AuthorizeClient:   authorizeClient,
		EmitServerEvent: func(ctx context.Context, gameID string, eventName string, payload json.RawMessage) error {
			return m.HandleGameEvent(gameID, eventName, payload)
		},
	})
	if err != nil {
		return fmt.Errorf("start game %s: %w", game.Name, err)
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

func (m *Manager) Stop(id string) error {
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
	return game.runtime.Close()
}

func (m *Manager) Delete(ctx context.Context, id string) error {
	if !validID(id) {
		return ErrUnknownGame
	}
	if err := m.Stop(id); err != nil && !errors.Is(err, ErrNotRunning) {
		return err
	}
	tx, err := m.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `SELECT set_config('easel.delete_game', $1, true)`, id); err != nil {
		return err
	}
	for _, table := range []string{"record_fragments", "records", "effective_schemas", "revision_contributions", "revision_contributors", "schema_contributions", "record_types"} {
		if _, err := tx.Exec(ctx, `DELETE FROM game_data.`+table+` WHERE game_id=$1`, id); err != nil {
			return fmt.Errorf("delete %s of game %s: %w", table, id, err)
		}
	}
	result, err := tx.Exec(ctx, `DELETE FROM game_data.games WHERE game_id=$1`, id)
	if err != nil {
		return fmt.Errorf("delete game %s: %w", id, err)
	}
	if result.RowsAffected() != 1 {
		return ErrUnknownGame
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return os.RemoveAll(m.folder(id))
}

func (m *Manager) Close() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.running))
	for id := range m.running {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		_ = m.Stop(id)
	}
}

func (m *Manager) runtime(id string) (session.ClientRuntime, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	game := m.running[id]
	if game == nil {
		return nil, false
	}
	return game.runtime, true
}

func (m *Manager) Runtime(id string) (session.ClientRuntime, bool) { return m.runtime(id) }

func (m *Manager) Running() map[string]session.ClientRuntime {
	m.mu.Lock()
	defer m.mu.Unlock()
	running := map[string]session.ClientRuntime{}
	for id, game := range m.running {
		running[id] = game.runtime
	}
	return running
}

func (m *Manager) Departure(id, userID string) (<-chan struct{}, func()) {
	departed := make(chan struct{})
	m.mu.Lock()
	defer m.mu.Unlock()
	game := m.running[id]
	if game == nil {
		close(departed)
		return departed, func() {}
	}
	if game.departure[userID] == nil {
		game.departure[userID] = map[chan struct{}]bool{}
	}
	game.departure[userID][departed] = true
	return departed, func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		if game.departure[userID][departed] {
			delete(game.departure[userID], departed)
		}
	}
}

func (m *Manager) depart(id, userID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	game := m.running[id]
	if game == nil {
		return
	}
	for departed := range game.departure[userID] {
		close(departed)
	}
	delete(game.departure, userID)
}

func (m *Manager) IsMember(ctx context.Context, id, userID string) (bool, error) {
	if !validID(id) || !validID(userID) {
		return false, nil
	}
	var member bool
	if err := m.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_data.members WHERE game_id=$1 AND user_id=$2)`, id, userID).Scan(&member); err != nil {
		return false, fmt.Errorf("check membership: %w", err)
	}
	return member, nil
}

func (m *Manager) Members(ctx context.Context, id string) ([]accounts.User, error) {
	if _, err := m.Get(ctx, id); err != nil {
		return nil, err
	}
	rows, err := m.Pool.Query(ctx, `SELECT u.user_id::text,u.display_name FROM game_data.members m JOIN accounts.users u USING(user_id) WHERE m.game_id=$1 ORDER BY m.joined_at,u.user_id`, id)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()
	members := []accounts.User{}
	for rows.Next() {
		var user accounts.User
		if err := rows.Scan(&user.ID, &user.DisplayName); err != nil {
			return nil, fmt.Errorf("read member: %w", err)
		}
		members = append(members, user)
	}
	return members, rows.Err()
}

func addMember(ctx context.Context, tx pgx.Tx, id, userID string) error {
	_, err := tx.Exec(ctx, `INSERT INTO game_data.members(game_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, id, userID)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == foreignKeyViolation {
		return ErrUnknownUser
	}
	if err != nil {
		return fmt.Errorf("add member: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO game_data.security_principals(game_id,id,principal_type,attributes) VALUES($1,$2,$3,'{"role":"player"}') ON CONFLICT DO NOTHING`, id, userID, security.UserType); err != nil {
		return fmt.Errorf("add user principal: %w", err)
	}
	return nil
}

func (m *Manager) AddMember(ctx context.Context, id, userID string) error {
	if _, err := m.Get(ctx, id); err != nil {
		return err
	}
	if !validID(userID) {
		return ErrUnknownUser
	}
	tx, err := database.BeginSerializable(ctx, m.Pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if err := addMember(ctx, tx, id, userID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit membership: %w", err)
	}
	if runtime, running := m.runtime(id); running {
		return runtime.EmitServer(ctx, "Users.Changed", []byte(`{}`))
	}
	return nil
}

func (m *Manager) Join(ctx context.Context, id string, user accounts.User) error {
	if !validID(id) {
		return ErrUnknownGame
	}
	tx, err := database.BeginSerializable(ctx, m.Pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var access string
	if err := tx.QueryRow(ctx, `SELECT access FROM game_data.games WHERE game_id=$1`, id).Scan(&access); errors.Is(err, pgx.ErrNoRows) {
		return ErrUnknownGame
	} else if err != nil {
		return fmt.Errorf("read game %s: %w", id, err)
	}
	var member bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_data.members WHERE game_id=$1 AND user_id=$2)`, id, user.ID).Scan(&member); err != nil {
		return fmt.Errorf("check membership: %w", err)
	}
	if member {
		return tx.Commit(ctx)
	}
	if access == MembersOnly {
		return ErrMembersOnly
	}
	if err := addMember(ctx, tx, id, user.ID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit membership: %w", err)
	}
	return nil
}

func (m *Manager) Remove(ctx context.Context, id, userID string) error {
	if _, err := m.Get(ctx, id); err != nil {
		return err
	}
	if !validID(userID) {
		return nil
	}
	tx, err := database.BeginSerializable(ctx, m.Pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	for _, statement := range []string{
		`DELETE FROM game_data.members WHERE game_id=$1 AND user_id=$2`,
		`DELETE FROM game_data.security_principals WHERE game_id=$1 AND id=$2`,
	} {
		if _, err := tx.Exec(ctx, statement, id, userID); err != nil {
			return fmt.Errorf("remove member: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit removal: %w", err)
	}
	m.depart(id, userID)
	return nil
}

func (m *Manager) OnGameEvent(eventName string, handler func(gameID string, payload json.RawMessage)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.gameEventListeners == nil {
		m.gameEventListeners = make(map[string][]func(gameID string, payload json.RawMessage))
	}
	m.gameEventListeners[eventName] = append(m.gameEventListeners[eventName], handler)
}

func (m *Manager) HandleGameEvent(gameID string, eventName string, payload json.RawMessage) error {
	m.mu.Lock()
	var listeners []func(gameID string, payload json.RawMessage)
	if m.gameEventListeners != nil {
		listeners = append(listeners, m.gameEventListeners[eventName]...)
	}
	m.mu.Unlock()

	for _, handler := range listeners {
		handler(gameID, payload)
	}
	return nil
}

func (m *Manager) EmitToGames(eventName string, payload json.RawMessage, targetID string) error {
	var targets []session.ClientRuntime
	m.mu.Lock()
	if targetID != "" {
		game, ok := m.running[targetID]
		if !ok || game == nil {
			m.mu.Unlock()
			return ErrNotRunning
		}
		targets = []session.ClientRuntime{game.runtime}
	} else {
		targets = make([]session.ClientRuntime, 0, len(m.running))
		for _, game := range m.running {
			if game != nil && game.runtime != nil {
				targets = append(targets, game.runtime)
			}
		}
	}
	m.mu.Unlock()

	for _, target := range targets {
		_ = target.DeliverServerEvent(eventName, payload)
	}
	return nil
}
