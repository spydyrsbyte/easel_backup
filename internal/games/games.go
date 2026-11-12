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
	"easel/internal/automation/pgstore"
	"easel/internal/database"
	"easel/internal/files"
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
	Lifecycle   string   `json:"lifecycle"`
}

type Manager struct {
	Pool      *pgxpool.Pool
	Catalog   *platform.Catalog
	Globals   []manifest.Package
	Folder    string
	ServerID  string
	FileLimit int64
	FileTypes []string

	OwnershipLost func(games []string, cause error)
	Packages      *PackageControl
	Slots         *Slots

	mu                 sync.Mutex
	catalogMu          sync.RWMutex
	membersMu          sync.Mutex
	members            map[string]map[string]bool
	membersVersion     uint64
	storage            string
	storageRelease     func()
	owned              ownership
	filesMu            sync.Mutex
	files              map[string]*files.Store
	running            map[string]*runningGame
	gameEventListeners map[string][]func(gameID string, payload json.RawMessage)
}

type runningGame struct {
	release   func()
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
	packages, err := m.catalog().Packages(application, modules)
	if err != nil {
		return nil, manifest.Plan{}, err
	}
	plan, err := m.plan(packages)
	if err != nil {
		return nil, manifest.Plan{}, err
	}
	return packages, plan, nil
}

func (m *Manager) plan(packages []manifest.Package) (manifest.Plan, error) {
	return platform.Plan(packages, m.Globals)
}

func (m *Manager) catalog() *platform.Catalog {
	m.catalogMu.RLock()
	defer m.catalogMu.RUnlock()
	return m.Catalog
}

func (m *Manager) Refresh(catalog *platform.Catalog) {
	m.catalogMu.Lock()
	defer m.catalogMu.Unlock()
	m.Catalog = catalog
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

func (m *Manager) server() string { return database.ServerID(m.ServerID) }

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
	id, err := revisions.CreateStorage(ctx, m.server(), "game", name, packages[0])
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
		added, err := m.Pool.Exec(ctx, `INSERT INTO game_data.members(game_id,user_id) SELECT $1,user_id FROM accounts.users WHERE user_id::text=$2 AND server_id=$3`, id, principal, m.server())
		if err != nil {
			return Game{}, err
		}
		if added.RowsAffected() != 1 {
			return Game{}, ErrUnknownUser
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

const selectGames = `SELECT g.game_id::text,g.name,c.name,g.modules,g.access,g.lifecycle FROM game_data.games g JOIN game_data.contributors c ON c.game_id=g.game_id AND c.contributor_id=g.application_id WHERE g.kind='game' AND g.server_id=$1`

func (m *Manager) scan(rows pgx.Rows) ([]Game, error) {
	defer rows.Close()
	found := []Game{}
	for rows.Next() {
		var game Game
		if err := rows.Scan(&game.ID, &game.Name, &game.Application, &game.Modules, &game.Access, &game.Lifecycle); err != nil {
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
	rows, err := m.Pool.Query(ctx, selectGames+` ORDER BY g.created_at,g.game_id`, m.server())
	if err != nil {
		return nil, fmt.Errorf("list games: %w", err)
	}
	return m.scan(rows)
}

func (m *Manager) Get(ctx context.Context, id string) (Game, error) {
	if !validID(id) {
		return Game{}, ErrUnknownGame
	}
	rows, err := m.Pool.Query(ctx, selectGames+` AND g.game_id=$2`, m.server(), id)
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
	command, err := m.Pool.Exec(ctx, `UPDATE game_data.games SET access=$2 WHERE game_id=$1 AND kind='game' AND server_id=$3`, id, access, m.server())
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

func (m *Manager) Delete(ctx context.Context, id string) error {
	if _, err := m.Get(ctx, id); err != nil {
		return err
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
		_ = m.halt(id, "", true)
	}
	m.mu.Lock()
	release := m.storageRelease
	m.storageRelease = nil
	m.mu.Unlock()
	if release != nil {
		release()
	}
	m.releaseOwnership()
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

func (m *Manager) forgetMembers(id string) {
	m.membersMu.Lock()
	defer m.membersMu.Unlock()
	delete(m.members, id)
	m.membersVersion++
}

func (m *Manager) IsMember(ctx context.Context, id, userID string) (bool, error) {
	if !validID(id) || !validID(userID) {
		return false, nil
	}
	userID = strings.ToLower(userID)
	m.membersMu.Lock()
	known, cached := m.members[id]
	version := m.membersVersion
	m.membersMu.Unlock()
	if cached {
		return known[userID], nil
	}
	rows, err := m.Pool.Query(ctx, `SELECT m.user_id::text FROM game_data.members m JOIN game_data.games g USING(game_id) WHERE m.game_id=$1 AND g.server_id=$2 AND g.kind='game'`, id, m.server())
	if err != nil {
		return false, fmt.Errorf("check membership: %w", err)
	}
	defer rows.Close()
	known = map[string]bool{}
	for rows.Next() {
		var member string
		if err := rows.Scan(&member); err != nil {
			return false, fmt.Errorf("check membership: %w", err)
		}
		known[member] = true
	}
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("check membership: %w", err)
	}
	if _, running := m.runtime(id); running {
		m.membersMu.Lock()
		if m.membersVersion == version {
			if m.members == nil {
				m.members = map[string]map[string]bool{}
			}
			m.members[id] = known
		}
		m.membersMu.Unlock()
	}
	return known[userID], nil
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
	var known bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM accounts.users u JOIN game_data.games g USING(server_id) WHERE g.game_id=$1 AND u.user_id=$2)`, id, userID).Scan(&known); err != nil {
		return fmt.Errorf("add member: %w", err)
	}
	if !known {
		return ErrUnknownUser
	}
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
	err = tx.Commit(ctx)
	m.forgetMembers(id)
	if err != nil {
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
	if err := tx.QueryRow(ctx, `SELECT access FROM game_data.games WHERE game_id=$1 AND kind='game' AND server_id=$2`, id, m.server()).Scan(&access); errors.Is(err, pgx.ErrNoRows) {
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
	err = tx.Commit(ctx)
	m.forgetMembers(id)
	if err != nil {
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
	err = tx.Commit(ctx)
	m.forgetMembers(id)
	if err != nil {
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
