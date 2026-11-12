package database

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type schemaSection struct {
	name   string
	tables []string
}

var schemaSections = []schemaSection{
	{"accounts", []string{"users", "passwords", "identities", "sessions", "oauth_states", "administrators"}},
	{"game_data", []string{"games", "automations", "contributors", "record_types", "contract_revisions", "revision_contributors", "schema_contributions", "revision_contributions", "effective_schemas", "records", "record_fragments", "security_principals", "security_relationships", "security_registries", "security_assignments", "members"}},
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
	var contents string
	for index, section := range schemaSections {
		missing := []string{}
		for _, table := range section.tables {
			var exists bool
			if err = tx.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, section.name+"."+table).Scan(&exists); err != nil {
				return fmt.Errorf("check %s.%s: %w", section.name, table, err)
			}
			if !exists {
				missing = append(missing, table)
			}
		}
		if len(missing) == 0 {
			continue
		}
		if len(missing) != len(section.tables) {
			return fmt.Errorf("%s schema is incomplete; missing %s; compare the database with %s", section.name, strings.Join(missing, ", "), schemaPath)
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
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit database initialization: %w", err)
	}
	return nil
}
