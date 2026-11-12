package games

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"easel/internal/automation/pgstore"
	"easel/internal/manifest"
	"easel/internal/packages"
	"easel/internal/platform"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNoPackageControl = errors.New("package management is not configured on this server")

type PackageControl struct {
	Installer   *packages.Installer
	Preferences string
}

type Incompatibility struct {
	Server  string `json:"server"`
	Game    string `json:"game"`
	Name    string `json:"name"`
	Problem string `json:"problem"`
}

func catalogProblems(ctx context.Context, pool *pgxpool.Pool, catalog *platform.Catalog, globals []manifest.Package) (map[string]Incompatibility, error) {
	rows, err := pool.Query(ctx, `SELECT g.game_id::text,g.server_id::text,s.name FROM game_data.games g JOIN hosting.servers s USING(server_id) WHERE g.kind='game' ORDER BY g.created_at,g.game_id`)
	if err != nil {
		return nil, fmt.Errorf("list games: %w", err)
	}
	type saved struct{ id, server, serverName string }
	stored := []saved{}
	for rows.Next() {
		var game saved
		if err := rows.Scan(&game.id, &game.server, &game.serverName); err != nil {
			rows.Close()
			return nil, err
		}
		stored = append(stored, game)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	problems := map[string]Incompatibility{}
	for _, entry := range stored {
		manager := &Manager{Pool: pool, Catalog: catalog, Globals: globals, ServerID: entry.server}
		game, err := manager.Get(ctx, entry.id)
		if err != nil {
			return nil, err
		}
		_, plan, err := manager.resolveSaved(ctx, game)
		if err == nil {
			err = (&pgstore.Revisions{Pool: pool}).Preview(ctx, entry.id, plan)
		}
		if err != nil {
			problems[entry.id] = Incompatibility{Server: entry.serverName, Game: entry.id, Name: game.Name, Problem: err.Error()}
		}
	}
	return problems, nil
}

func CompatibilityCheck(pool *pgxpool.Pool, easelDir string, globals []manifest.Package) func(context.Context, *platform.Catalog) error {
	return func(ctx context.Context, next *platform.Catalog) error {
		after, err := catalogProblems(ctx, pool, next, globals)
		if err != nil {
			return err
		}
		if len(after) == 0 {
			return nil
		}
		before := map[string]Incompatibility{}
		if current, err := platform.LoadCatalog(easelDir); err == nil {
			if before, err = catalogProblems(ctx, pool, current, globals); err != nil {
				return err
			}
		}
		broken := []string{}
		for id, problem := range after {
			if _, already := before[id]; !already {
				broken = append(broken, fmt.Sprintf("game %q on server %s: %s", problem.Name, problem.Server, problem.Problem))
			}
		}
		if len(broken) == 0 {
			return nil
		}
		return fmt.Errorf("saved games are not compatible with this change; nothing was changed. Write a migration plan (easel schema migrate) or keep the installed version.\n  %s", strings.Join(broken, "\n  "))
	}
}

func (m *Manager) SetModules(ctx context.Context, id string, modules []string) error {
	game, err := m.Get(ctx, id)
	if err != nil {
		return err
	}
	if modules == nil {
		modules = []string{}
	}
	seen := map[string]bool{}
	for _, module := range modules {
		if seen[module] {
			return fmt.Errorf("module %s is listed twice", module)
		}
		seen[module] = true
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.running[id] != nil {
		return ErrRunning
	}
	game.Modules = modules
	_, plan, err := m.resolveSaved(ctx, game)
	if err != nil {
		return err
	}
	if err := (&pgstore.Revisions{Pool: m.Pool}).Preview(ctx, id, plan); err != nil {
		return fmt.Errorf("game %s cannot use these modules: %w", game.Name, err)
	}
	if _, err := m.Pool.Exec(ctx, `UPDATE game_data.games SET modules=$2 WHERE game_id=$1`, id, modules); err != nil {
		return fmt.Errorf("store modules of game %s: %w", game.Name, err)
	}
	return nil
}

func (m *Manager) control() (*PackageControl, error) {
	if m.Packages == nil || m.Packages.Installer == nil {
		return nil, ErrNoPackageControl
	}
	return m.Packages, nil
}

func (m *Manager) RefreshPackages(context.Context) (any, error) {
	control, err := m.control()
	if err != nil {
		return nil, err
	}
	catalog, err := platform.LoadCatalog(control.Installer.EaselDir)
	if err != nil {
		return nil, fmt.Errorf("the installed packages do not load, so the previous catalog stays in use: %w", err)
	}
	m.Refresh(catalog)
	return catalog.Installed(), nil
}

func (m *Manager) InstalledPackages(context.Context) (any, error) {
	control, err := m.control()
	if err != nil {
		return nil, err
	}
	preferences, err := packages.LoadPreferences(control.Preferences)
	if err != nil {
		return nil, err
	}
	return control.Installer.List(preferences)
}

func (m *Manager) PackageUpdates(ctx context.Context) (any, error) {
	control, err := m.control()
	if err != nil {
		return nil, err
	}
	preferences, err := packages.LoadPreferences(control.Preferences)
	if err != nil {
		return nil, err
	}
	return control.Installer.Check(ctx, preferences)
}

func (m *Manager) UpdatePackage(ctx context.Context, id string) (any, error) {
	control, err := m.control()
	if err != nil {
		return nil, err
	}
	preferences, err := packages.LoadPreferences(control.Preferences)
	if err != nil {
		return nil, err
	}
	updates, err := control.Installer.Check(ctx, preferences)
	if err != nil {
		return nil, err
	}
	for _, update := range updates {
		if update.ID != id {
			continue
		}
		if update.Problem != "" {
			return nil, fmt.Errorf("%s: %s", id, update.Problem)
		}
		if !update.Newer {
			return nil, fmt.Errorf("%s %s is already the newest on channel %s", id, update.Installed, update.Channel)
		}
		result, err := control.Installer.Apply(ctx, update)
		if err != nil {
			return nil, err
		}
		if _, err := m.RefreshPackages(ctx); err != nil {
			return nil, err
		}
		return result, nil
	}
	return nil, fmt.Errorf("%s is not installed or offers no update channels", id)
}

func (s scriptedGames) SetModules(ctx context.Context, id string, modules []string) error {
	return s.manager.SetModules(ctx, id, modules)
}
func (s scriptedGames) RefreshPackages(ctx context.Context) (any, error) {
	return s.manager.RefreshPackages(ctx)
}
func (s scriptedGames) InstalledPackages(ctx context.Context) (any, error) {
	return s.manager.InstalledPackages(ctx)
}
func (s scriptedGames) PackageUpdates(ctx context.Context) (any, error) {
	return s.manager.PackageUpdates(ctx)
}
func (s scriptedGames) UpdatePackage(ctx context.Context, id string) (any, error) {
	return s.manager.UpdatePackage(ctx, id)
}
