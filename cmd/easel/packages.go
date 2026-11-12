package main

import (
	"context"
	"fmt"
	"path/filepath"

	"easel/internal/games"
	"easel/internal/packages"
	"easel/internal/platform"
	"github.com/jackc/pgx/v5/pgxpool"
)

const packagesUsage = `use: easel packages list
     easel packages inspect -file ARCHIVE
     easel packages install -file ARCHIVE [-allow-downgrade]
     easel packages remove -package ID
     easel packages rollback -package ID
     easel packages updates
     easel packages update -package ID | -all
     easel packages channel -package ID|default [-channel NAME] [-update manual|startup]
     easel packages pack -dir FOLDER -out ARCHIVE`

func preferencesPath(configDir string) string { return filepath.Join(configDir, "packages.json") }

func newInstaller(pool *pgxpool.Pool, easelDir string) (*packages.Installer, error) {
	definition, err := platform.Load(filepath.Join(easelDir, "server"))
	if err != nil {
		return nil, err
	}
	installer := &packages.Installer{EaselDir: easelDir, Globals: definition.Libraries}
	if pool != nil {
		installer.Compatible = games.CompatibilityCheck(pool, easelDir, definition.Libraries)
	}
	return installer, nil
}

func packageUsage(ctx context.Context, pool *pgxpool.Pool, listed []packages.Installed) ([]map[string]any, error) {
	report := []map[string]any{}
	for _, pkg := range listed {
		line := map[string]any{"package": pkg}
		rows, err := pool.Query(ctx, `SELECT s.name,g.name,g.game_id::text,g.kind,r.package_version FROM game_data.games g
 JOIN hosting.servers s USING(server_id)
 JOIN game_data.contributors c ON c.game_id=g.game_id AND c.name=$1
 JOIN game_data.revision_contributors r ON r.game_id=g.game_id AND r.revision_id=g.active_revision_id AND r.contributor_id=c.contributor_id
 ORDER BY s.name,g.created_at`, pkg.ID)
		if err != nil {
			return nil, err
		}
		used := []map[string]any{}
		for rows.Next() {
			var server, name, id, kind, version string
			if err := rows.Scan(&server, &name, &id, &kind, &version); err != nil {
				rows.Close()
				return nil, err
			}
			used = append(used, map[string]any{"server": server, "name": name, "id": id, "kind": kind, "savedWith": version, "current": version == pkg.Version})
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		line["usedBy"] = used
		report = append(report, line)
	}
	return report, nil
}

func packagesCommand(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("%s", packagesUsage)
	}
	i := newInstallation("packages " + args[0])
	file := i.flags.String("file", "", "package archive")
	id := i.flags.String("package", "", "package id, such as owner.host.name")
	all := i.flags.Bool("all", false, "update every package that has a newer release on its channel")
	downgrade := i.flags.Bool("allow-downgrade", false, "install an older version over a newer one")
	channel := i.flags.String("channel", "", "update channel to follow")
	mode := i.flags.String("update", "", "manual or startup")
	dir := i.flags.String("dir", "", "package folder")
	out := i.flags.String("out", "", "archive to write")
	if err := i.flags.Parse(args[1:]); err != nil {
		return err
	}
	if args[0] == "pack" {
		if err := need(i.flags, map[string]*string{"dir": dir, "out": out}); err != nil {
			return err
		}
		if err := packages.Pack(*dir, *out); err != nil {
			return err
		}
		return printJSON(map[string]string{"archive": *out})
	}
	preferencesFile := preferencesPath(i.configDir())
	preferences, err := packages.LoadPreferences(preferencesFile)
	if err != nil {
		return err
	}
	if args[0] == "channel" {
		if err := need(i.flags, map[string]*string{"package": id}); err != nil {
			return err
		}
		chosen := preferences.Packages[*id]
		if *id == "default" {
			chosen = preferences.Default
		}
		if *channel != "" {
			chosen.Channel = *channel
		}
		if *mode != "" {
			chosen.Update = *mode
		}
		if *mode != "" && *mode != packages.Manual && *mode != packages.Startup {
			return fmt.Errorf(`-update must be "manual" or "startup"`)
		}
		if *id == "default" {
			preferences.Default = chosen
		} else {
			preferences.Packages[*id] = chosen
		}
		if err := preferences.Save(preferencesFile); err != nil {
			return err
		}
		return printJSON(preferences)
	}
	pool, err := i.open(ctx, true)
	if err != nil {
		return err
	}
	defer pool.Close()
	installer, err := newInstaller(pool, *i.easelDir)
	if err != nil {
		return err
	}
	installer.AllowDowngrade = *downgrade
	switch args[0] {
	case "list":
		listed, err := installer.List(preferences)
		if err != nil {
			return err
		}
		report, err := packageUsage(ctx, pool, listed)
		if err != nil {
			return err
		}
		return printJSON(report)
	case "inspect", "install":
		if err := need(i.flags, map[string]*string{"file": file}); err != nil {
			return err
		}
		if args[0] == "inspect" {
			inspection, err := installer.Inspect(ctx, *file)
			if err != nil {
				return err
			}
			return printJSON(inspection)
		}
		result, err := installer.Install(ctx, *file)
		if err != nil {
			return err
		}
		return printJSON(result)
	case "remove", "rollback":
		if err := need(i.flags, map[string]*string{"package": id}); err != nil {
			return err
		}
		act := installer.Remove
		if args[0] == "rollback" {
			act = installer.Rollback
		}
		result, err := act(ctx, *id)
		if err != nil {
			return err
		}
		return printJSON(result)
	case "updates":
		updates, err := installer.Check(ctx, preferences)
		if err != nil {
			return err
		}
		return printJSON(updates)
	case "update":
		if *id == "" && !*all {
			return fmt.Errorf("name a package with -package or pass -all")
		}
		updates, err := installer.Check(ctx, preferences)
		if err != nil {
			return err
		}
		outcomes := []packages.Outcome{}
		failed := false
		for _, update := range updates {
			if (*id != "" && update.ID != *id) || (*id == "" && !update.Newer) {
				continue
			}
			outcome := packages.Outcome{Update: update}
			switch {
			case update.Problem != "":
			case !update.Newer:
				outcome.Problem = "already the newest on channel " + update.Channel
			default:
				result, err := installer.Apply(ctx, update)
				if err != nil {
					outcome.Problem = err.Error()
				} else {
					outcome.Result = &result
				}
			}
			failed = failed || outcome.Problem != ""
			outcomes = append(outcomes, outcome)
		}
		if *id != "" && len(outcomes) == 0 {
			return fmt.Errorf("%s is not installed or offers no update channels", *id)
		}
		if err := printJSON(outcomes); err != nil {
			return err
		}
		if failed {
			return fmt.Errorf("some updates were not applied")
		}
		return nil
	}
	return fmt.Errorf("%s", packagesUsage)
}
