package database

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const SchemaVersion = 2

type schemaSection struct {
	name   string
	tables []string
}

var schemaSections = []schemaSection{
	{"hosting", []string{"installation", "servers"}},
	{"accounts", []string{"users", "passwords", "identities", "sessions", "oauth_states", "administrators"}},
	{"game_data", []string{"games", "automations", "contributors", "record_types", "contract_revisions", "revision_contributors", "schema_contributions", "revision_contributions", "effective_schemas", "records", "record_fragments", "security_principals", "security_relationships", "security_registries", "security_assignments", "members", "files", "scheduled_events", "runtime_owners"}},
}

func Initialize(ctx context.Context, pool *pgxpool.Pool, schemaPath string) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("initialize database: %w", err)
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(738651092)`); err != nil {
		return fmt.Errorf("lock database initialization: %w", err)
	}
	missing := make([][]string, len(schemaSections))
	present := 0
	for index, section := range schemaSections {
		for _, table := range section.tables {
			var exists bool
			if err = tx.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, section.name+"."+table).Scan(&exists); err != nil {
				return fmt.Errorf("check %s.%s: %w", section.name, table, err)
			}
			if exists {
				present++
			} else {
				missing[index] = append(missing[index], table)
			}
		}
	}
	outdated := fmt.Sprintf("this database was created by an older Easel; alpha builds have no migrations, so back up what you need (easel backup), recreate the database, and let Easel initialize it from %s", schemaPath)
	if len(missing[0]) == len(schemaSections[0].tables) && present > 0 {
		return fmt.Errorf("database has no schema version: %s", outdated)
	}
	var contents string
	for index, section := range schemaSections {
		if len(missing[index]) == 0 {
			continue
		}
		if len(missing[index]) != len(section.tables) {
			return fmt.Errorf("%s schema is incomplete; missing %s: %s", section.name, strings.Join(missing[index], ", "), outdated)
		}
		if contents == "" {
			data, err := os.ReadFile(schemaPath)
			if err != nil {
				return fmt.Errorf("read canonical schema: %w", err)
			}
			contents = string(data)
		}
		start := "CREATE SCHEMA " + section.name + ";"
		end := "COMMIT;"
		if index+1 < len(schemaSections) {
			end = "CREATE SCHEMA " + schemaSections[index+1].name + ";"
		}
		_, tail, ok := strings.Cut(contents, start)
		if !ok {
			return fmt.Errorf("canonical schema %s has no %s definition", schemaPath, section.name)
		}
		body, _, ok := strings.Cut(tail, end)
		if !ok {
			return fmt.Errorf("canonical schema %s has no end to the %s definition", schemaPath, section.name)
		}
		if _, err = tx.Exec(ctx, start+body); err != nil {
			return fmt.Errorf("initialize %s from %s: %w", section.name, schemaPath, err)
		}
	}
	var version int
	if err = tx.QueryRow(ctx, `SELECT schema_version FROM hosting.installation`).Scan(&version); err != nil {
		return fmt.Errorf("read database schema version: %w", err)
	}
	if version != SchemaVersion {
		return fmt.Errorf("database schema is version %d and this Easel needs version %d: %s", version, SchemaVersion, outdated)
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit database initialization: %w", err)
	}
	return nil
}
