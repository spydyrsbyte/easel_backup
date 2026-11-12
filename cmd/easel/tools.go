package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"easel/internal/database"
	"easel/internal/games"
	"easel/internal/platform"
	"easel/internal/portable"
	"easel/internal/seal"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type installation struct {
	flags          *flag.FlagSet
	databaseConfig *string
	easelDir       *string
	gamesDir       *string
	server         *string
}

func newInstallation(name string) *installation {
	flags := flag.NewFlagSet("easel "+name, flag.ContinueOnError)
	return &installation{
		flags:          flags,
		databaseConfig: flags.String("database-config", "config/database.json", "database settings file"),
		easelDir:       flags.String("easel-dir", "easel", "Easel resources directory"),
		gamesDir:       flags.String("games-dir", "games", "folder holding one folder per game"),
		server:         flags.String("server", database.DefaultServerName, "name of the server to work on"),
	}
}

func (i *installation) schemaPath() string {
	return filepath.Join(*i.easelDir, "database", "schema.sql")
}

func (i *installation) configDir() string { return filepath.Dir(*i.databaseConfig) }

func (i *installation) open(ctx context.Context, initialize bool) (*pgxpool.Pool, error) {
	seal.Configure(licenseStore(i.configDir()))
	settings, err := database.LoadConfig(*i.databaseConfig)
	if err != nil {
		return nil, err
	}
	pool, err := database.Open(ctx, settings)
	if err != nil {
		return nil, err
	}
	if initialize {
		setup, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if err := database.Initialize(setup, pool, i.schemaPath()); err != nil {
			pool.Close()
			return nil, err
		}
	}
	return pool, nil
}

func (i *installation) serverID(ctx context.Context, pool *pgxpool.Pool) (string, error) {
	var id string
	err := pool.QueryRow(ctx, `SELECT server_id::text FROM hosting.servers WHERE name=$1`, *i.server).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("there is no server named %s", *i.server)
	}
	return id, err
}

func (i *installation) manager(ctx context.Context, pool *pgxpool.Pool) (*games.Manager, error) {
	id, err := i.serverID(ctx, pool)
	if err != nil {
		return nil, err
	}
	catalog, err := platform.LoadCatalog(*i.easelDir)
	if err != nil {
		return nil, err
	}
	definition, err := platform.Load(filepath.Join(*i.easelDir, "server"))
	if err != nil {
		return nil, err
	}
	return &games.Manager{Pool: pool, Catalog: catalog, Globals: definition.Libraries, Folder: *i.gamesDir, ServerID: id}, nil
}

func printJSON(value any) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

type pairs map[string]string

func (p pairs) String() string { return fmt.Sprint(map[string]string(p)) }

func (p pairs) Set(value string) error {
	from, to, ok := strings.Cut(value, "=")
	if !ok || from == "" || to == "" {
		return fmt.Errorf("write a mapping as from=to")
	}
	p[from] = to
	return nil
}

func need(flags *flag.FlagSet, values map[string]*string) error {
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if *values[name] == "" {
			flags.Usage()
			return fmt.Errorf("-%s is required", name)
		}
	}
	return nil
}

func backupCommand(ctx context.Context, args []string) error {
	i := newInstallation("backup")
	out := i.flags.String("out", "", "archive to write")
	packages := i.flags.Bool("packages", false, "include the installed applications, modules, and server definitions")
	if err := i.flags.Parse(args); err != nil {
		return err
	}
	if err := need(i.flags, map[string]*string{"out": out}); err != nil {
		return err
	}
	pool, err := i.open(ctx, true)
	if err != nil {
		return err
	}
	defer pool.Close()
	header, err := portable.Backup(ctx, pool, *out, portable.BackupOptions{GamesDir: *i.gamesDir, ConfigDir: i.configDir(), EaselDir: *i.easelDir, Packages: *packages})
	if err != nil {
		return err
	}
	return printJSON(header)
}

func restoreCommand(ctx context.Context, args []string) error {
	i := newInstallation("restore")
	in := i.flags.String("in", "", "backup archive to restore")
	if err := i.flags.Parse(args); err != nil {
		return err
	}
	if err := need(i.flags, map[string]*string{"in": in}); err != nil {
		return err
	}
	pool, err := i.open(ctx, false)
	if err != nil {
		return err
	}
	defer pool.Close()
	report, err := portable.Restore(ctx, pool, *in, portable.RestoreOptions{SchemaPath: i.schemaPath(), GamesDir: *i.gamesDir, ConfigDir: i.configDir(), EaselDir: *i.easelDir})
	if err != nil {
		return err
	}
	return printJSON(report)
}

func gamesCommand(ctx context.Context, args []string) error {
	release := len(args) > 0 && args[0] == "release"
	if release {
		args = args[1:]
	}
	i := newInstallation("games")
	game := i.flags.String("game", "", "game id to release after a relocation was abandoned")
	if err := i.flags.Parse(args); err != nil {
		return err
	}
	pool, err := i.open(ctx, true)
	if err != nil {
		return err
	}
	defer pool.Close()
	manager, err := i.manager(ctx, pool)
	if err != nil {
		return err
	}
	if release {
		if err := need(i.flags, map[string]*string{"game": game}); err != nil {
			return err
		}
		if err := manager.Release(ctx, *game); err != nil {
			return err
		}
	}
	listed, err := manager.List(ctx)
	if err != nil {
		return err
	}
	return printJSON(listed)
}

func schemaCommand(ctx context.Context, args []string) error {
	if len(args) == 0 || (args[0] != "status" && args[0] != "migrate") {
		return fmt.Errorf("use: easel schema status -game ID, or easel schema migrate -game ID -plan FILE [-dry-run]")
	}
	i := newInstallation("schema " + args[0])
	game := i.flags.String("game", "", "game id")
	plan := new(string)
	dryRun := new(bool)
	if args[0] == "migrate" {
		plan = i.flags.String("plan", "", "migration plan file")
		dryRun = i.flags.Bool("dry-run", false, "validate the migration and change nothing")
	}
	if err := i.flags.Parse(args[1:]); err != nil {
		return err
	}
	required := map[string]*string{"game": game}
	if args[0] == "migrate" {
		required["plan"] = plan
	}
	if err := need(i.flags, required); err != nil {
		return err
	}
	pool, err := i.open(ctx, true)
	if err != nil {
		return err
	}
	defer pool.Close()
	manager, err := i.manager(ctx, pool)
	if err != nil {
		return err
	}
	if args[0] == "status" {
		status, err := manager.SchemaStatus(ctx, *game)
		if err != nil {
			return err
		}
		return printJSON(status)
	}
	data, err := os.ReadFile(*plan)
	if err != nil {
		return err
	}
	parsed, err := games.ParseMigrationPlan(data)
	if err != nil {
		return err
	}
	parsed.DryRun = *dryRun
	release, err := manager.Claim(ctx, *game)
	if err != nil {
		return err
	}
	defer release()
	report, err := manager.ApplyMigration(ctx, *game, parsed)
	if err != nil {
		return err
	}
	return printJSON(report)
}

func filesCommand(ctx context.Context, args []string) error {
	if len(args) == 0 || (args[0] != "sweep" && args[0] != "check") {
		return fmt.Errorf("use: easel files check, or easel files sweep")
	}
	i := newInstallation("files " + args[0])
	if err := i.flags.Parse(args[1:]); err != nil {
		return err
	}
	pool, err := i.open(ctx, true)
	if err != nil {
		return err
	}
	defer pool.Close()
	rows, err := pool.Query(ctx, `SELECT game_id::text,name FROM game_data.games ORDER BY created_at,game_id`)
	if err != nil {
		return err
	}
	type entry struct{ id, name string }
	stored := []entry{}
	for rows.Next() {
		var found entry
		if err := rows.Scan(&found.id, &found.name); err != nil {
			rows.Close()
			return err
		}
		stored = append(stored, found)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	manager := &games.Manager{Pool: pool, Folder: *i.gamesDir}
	report := []map[string]any{}
	for _, game := range stored {
		store := manager.Files(game.id)
		line := map[string]any{"game": game.id, "name": game.name}
		if args[0] == "sweep" {
			removed, err := store.Sweep(ctx)
			if err != nil {
				return err
			}
			line["removed"] = removed
		}
		missing, err := store.Missing(ctx)
		if err != nil {
			return err
		}
		line["missing"] = missing
		report = append(report, line)
	}
	return printJSON(report)
}

func exportCommand(ctx context.Context, args []string) error {
	i := newInstallation("export")
	game := i.flags.String("game", "", "game id")
	out := i.flags.String("out", "", "archive to write")
	relocate := i.flags.Bool("relocate", false, "hand the game over: refuse if it is running anywhere, and keep it from starting here afterwards")
	if err := i.flags.Parse(args); err != nil {
		return err
	}
	if err := need(i.flags, map[string]*string{"game": game, "out": out}); err != nil {
		return err
	}
	pool, err := i.open(ctx, true)
	if err != nil {
		return err
	}
	defer pool.Close()
	manager, err := i.manager(ctx, pool)
	if err != nil {
		return err
	}
	defer manager.Close()
	if *relocate {
		if _, err := manager.Get(ctx, *game); err != nil {
			return err
		}
		release, err := manager.Claim(ctx, *game)
		if errors.Is(err, games.ErrOwnedElsewhere) {
			return fmt.Errorf("the game is running; stop or suspend it before relocating it")
		}
		if err != nil {
			return err
		}
		defer release()
	}
	header, err := portable.Export(ctx, pool, *game, *out, portable.ExportOptions{GamesDir: *i.gamesDir, ServerID: manager.ServerID})
	if err != nil {
		return err
	}
	if *relocate {
		if err := manager.MarkRelocated(ctx, *game); err != nil {
			return fmt.Errorf("the archive was written, but the game could not be marked as relocated: %w", err)
		}
	}
	return printJSON(header)
}

func importCommand(ctx context.Context, args []string) error {
	i := newInstallation("import")
	in := i.flags.String("in", "", "game archive to import")
	name := i.flags.String("name", "", "name for the imported game; defaults to its exported name")
	match := i.flags.Bool("match-usernames", false, "give each exported account's place to the account with the same username on this server")
	accounts := pairs{}
	i.flags.Var(accounts, "account", "exported-account-id=account id or username on this server; repeat for each account")
	if err := i.flags.Parse(args); err != nil {
		return err
	}
	if err := need(i.flags, map[string]*string{"in": in}); err != nil {
		return err
	}
	pool, err := i.open(ctx, true)
	if err != nil {
		return err
	}
	defer pool.Close()
	manager, err := i.manager(ctx, pool)
	if err != nil {
		return err
	}
	report, err := portable.Import(ctx, pool, *in, portable.ImportOptions{GamesDir: *i.gamesDir, ServerID: manager.ServerID, Name: *name, Accounts: accounts, MatchUsernames: *match, Installed: func(id string) bool {
		_, application := manager.Catalog.Applications[id]
		_, module := manager.Catalog.Modules[id]
		return application || module
	}})
	if err != nil {
		return err
	}
	return printJSON(report)
}

func accountsCommand(ctx context.Context, args []string) error {
	if len(args) == 0 || args[0] != "reassign" {
		return fmt.Errorf("use: easel accounts reassign -game ID -from ACCOUNT -to ACCOUNT")
	}
	i := newInstallation("accounts reassign")
	game := i.flags.String("game", "", "game id")
	from := i.flags.String("from", "", "account id that holds the place now")
	to := i.flags.String("to", "", "account id that takes the place")
	if err := i.flags.Parse(args[1:]); err != nil {
		return err
	}
	if err := need(i.flags, map[string]*string{"game": game, "from": from, "to": to}); err != nil {
		return err
	}
	pool, err := i.open(ctx, true)
	if err != nil {
		return err
	}
	defer pool.Close()
	server, err := i.serverID(ctx, pool)
	if err != nil {
		return err
	}
	if err := portable.Reassign(ctx, pool, server, *game, *from, *to); err != nil {
		return err
	}
	return printJSON(map[string]string{"game": *game, "from": *from, "to": *to})
}
