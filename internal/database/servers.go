package database

import (
	"context"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	DefaultServerID   = "00000000-0000-0000-0000-000000000000"
	DefaultServerName = "default"
)

var serverName = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,31}$`)

func ValidServerName(name string) bool { return serverName.MatchString(name) }

func ServerID(id string) string {
	if id == "" {
		return DefaultServerID
	}
	return id
}

func EnsureServer(ctx context.Context, pool *pgxpool.Pool, name string) (string, error) {
	if !ValidServerName(name) {
		return "", fmt.Errorf("server name %q must be 1 to 32 lowercase letters, digits, underscores, or dashes, and start with a letter or digit", name)
	}
	var id string
	if err := pool.QueryRow(ctx, `INSERT INTO hosting.servers(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING server_id::text`, name).Scan(&id); err != nil {
		return "", fmt.Errorf("register server %s: %w", name, err)
	}
	return id, nil
}
