package games

import (
	"context"

	"easel/internal/automation/pgstore"
	"easel/internal/manifest"
)

func (m *Manager) resolveSaved(ctx context.Context, game Game) ([]manifest.Package, manifest.Plan, error) {
	modules := []string{}
	for _, id := range game.Modules {
		if _, installed := m.Catalog.Modules[id]; !installed {
			var known bool
			if err := m.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_data.contributors c
 JOIN game_data.revision_contributors r USING(game_id,contributor_id)
 JOIN game_data.games g ON g.game_id=r.game_id AND g.active_revision_id=r.revision_id
 WHERE c.game_id=$1 AND c.name=$2 AND c.kind='module')`, game.ID, id).Scan(&known); err != nil {
				return nil, manifest.Plan{}, err
			}
			if known {
				continue
			}
		}
		modules = append(modules, id)
	}
	return m.resolve(game.Application, modules)
}

func (m *Manager) MigrateSchema(ctx context.Context, id string, migration pgstore.SchemaMigration) error {
	game, err := m.Get(ctx, id)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.running[id] != nil {
		return ErrRunning
	}
	_, plan, err := m.resolveSaved(ctx, game)
	if err != nil {
		return err
	}
	_, _, err = (&pgstore.Revisions{Pool: m.Pool}).Migrate(ctx, id, plan, migration)
	return err
}
