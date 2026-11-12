package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"

	"easel/internal/database"
	"easel/internal/games"
	"easel/internal/hosting"
	"easel/internal/packages"
	"easel/internal/platform"
	"easel/internal/seal"
)

var commands = map[string]func(context.Context, []string) error{
	"backup":    backupCommand,
	"restore":   restoreCommand,
	"games":     gamesCommand,
	"schema":    schemaCommand,
	"files":     filesCommand,
	"export":    exportCommand,
	"import":    importCommand,
	"accounts":  accountsCommand,
	"packages":  packagesCommand,
	"version":   versionCommand,
	"publisher": publisherCommand,
	"license":   licenseCommand,
}

func versionCommand(context.Context, []string) error {
	limit := "unlimited"
	if maxActiveGames > 0 {
		limit = fmt.Sprint(maxActiveGames)
	}
	return printJSON(map[string]any{"edition": editionName, "activeGames": limit, "databaseSchema": database.SchemaVersion})
}

func main() {
	args := os.Args[1:]
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") && args[0] != "serve" {
		command := commands[args[0]]
		if command == nil {
			fmt.Fprintf(os.Stderr, "easel: unknown command %q\n", args[0])
			os.Exit(2)
		}
		if err := command(context.Background(), args[1:]); err != nil {
			if !errors.Is(err, flag.ErrHelp) {
				fmt.Fprintln(os.Stderr, "easel "+args[0]+":", err)
			}
			os.Exit(1)
		}
		return
	}
	if len(args) > 0 && args[0] == "serve" {
		args = args[1:]
	}
	if err := run(args); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	flags := flag.NewFlagSet("easel", flag.ExitOnError)
	addr := flags.String("addr", "127.0.0.1:5000", "HTTP listen address when config/servers.json is absent")
	databaseConfigPath := flags.String("database-config", "config/database.json", "database settings file")
	authConfigPath := flags.String("auth-config", "config/auth.json", "sign-in settings file; optional")
	easelDir := flags.String("easel-dir", "easel", "Easel resources directory")
	gamesDir := flags.String("games-dir", "games", "folder holding one folder per game")
	_ = flags.Parse(args)
	configDir := filepath.Dir(*databaseConfigPath)
	seal.Configure(licenseStore(configDir))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	settings, err := database.LoadConfig(*databaseConfigPath)
	if err != nil {
		return err
	}
	databasePool, err := database.Open(ctx, settings)
	if err != nil {
		return err
	}
	defer databasePool.Close()
	slog.Info("connected to PostgreSQL")
	setupContext, cancelSetup := context.WithTimeout(ctx, 30*time.Second)
	err = database.Initialize(setupContext, databasePool, filepath.Join(*easelDir, "database", "schema.sql"))
	cancelSetup()
	if err != nil {
		return err
	}
	slog.Info("database ready", "schema", database.SchemaVersion)

	configured, err := hosting.LoadServers(configDir, *addr, *authConfigPath)
	if err != nil {
		return err
	}
	definition, err := platform.Load(filepath.Join(*easelDir, "server"))
	if err != nil {
		return err
	}
	installer := &packages.Installer{EaselDir: *easelDir, Globals: definition.Libraries, Compatible: games.CompatibilityCheck(databasePool, *easelDir, definition.Libraries)}
	preferencesFile := preferencesPath(configDir)
	if preferences, err := packages.LoadPreferences(preferencesFile); err != nil {
		slog.Error("package preferences ignored", "error", err)
	} else {
		for _, outcome := range installer.Startup(ctx, preferences) {
			if outcome.Problem != "" {
				slog.Error("package update skipped; the installed version stays in use", "package", outcome.ID, "channel", outcome.Channel, "error", outcome.Problem)
			} else if outcome.Result != nil {
				slog.Info("package updated", "package", outcome.ID, "from", outcome.Installed, "to", outcome.Result.Version)
			}
		}
	}
	shared := hosting.Shared{
		Pool: databasePool, EaselDir: *easelDir, GamesDir: *gamesDir, ConfigDir: configDir,
		Slots: &games.Slots{Max: maxActiveGames}, Installer: installer, Preferences: preferencesFile,
		ReportError: func(r *http.Request, err error) {
			slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "error", err)
		},
		Lost: func(server string, lost []string, cause error) {
			slog.Error("lost the database connection that holds game ownership; the games were halted and keep their state", "server", server, "games", len(lost), "error", cause)
		},
	}
	slog.Info("starting Easel", "edition", editionName, "servers", len(configured))

	type listening struct {
		hosted *hosting.Server
		http   *http.Server
	}
	running := []listening{}
	errs := make(chan error, len(configured))
	closeAll := func() {
		for _, entry := range running {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			if err := entry.http.Shutdown(shutdownCtx); err != nil {
				_ = entry.http.Close()
			}
			cancel()
		}
		for _, entry := range running {
			entry.hosted.Close()
		}
	}
	for _, config := range configured {
		hosted, err := hosting.Start(ctx, shared, config)
		if err != nil {
			closeAll()
			return err
		}
		listener, err := net.Listen("tcp", config.Addr)
		if err != nil {
			hosted.Close()
			closeAll()
			return fmt.Errorf("server %s: %w", config.Name, err)
		}
		srv := &http.Server{
			Handler:           hosted.Handler,
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       15 * time.Second,
			WriteTimeout:      15 * time.Second,
			IdleTimeout:       60 * time.Second,
		}
		running = append(running, listening{hosted, srv})
		slog.Info("server started", "server", config.Name, "address", config.Addr, "public_url", hosted.PublicURL, "application", hosted.Definition.Server.ID(), "providers", hosted.Providers, "running games", len(hosted.Manager.Running()))
		go func(name string) {
			if err := srv.Serve(listener); !errors.Is(err, http.ErrServerClosed) {
				errs <- fmt.Errorf("server %s: %w", name, err)
			}
		}(config.Name)
	}

	select {
	case err = <-errs:
	case <-ctx.Done():
		stop()
		slog.Info("shutting down Easel")
	}
	closeAll()
	return err
}
