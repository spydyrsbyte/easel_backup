package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"

	"easel/internal/accounts"
	"easel/internal/database"
	"easel/internal/games"
	"easel/internal/platform"
	"easel/internal/server"
)

var commands = map[string]func(context.Context, []string) error{
	"backup":   backupCommand,
	"restore":  restoreCommand,
	"games":    gamesCommand,
	"schema":   schemaCommand,
	"files":    filesCommand,
	"export":   exportCommand,
	"import":   importCommand,
	"accounts": accountsCommand,
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
	flag := flag.NewFlagSet("easel", flag.ExitOnError)
	addr := flag.String("addr", "127.0.0.1:5000", "HTTP listen address")
	databaseConfigPath := flag.String("database-config", "config/database.json", "database settings file")
	authConfigPath := flag.String("auth-config", "config/auth.json", "sign-in settings file; optional")
	easelDir := flag.String("easel-dir", "easel", "Easel resources directory")
	gamesDir := flag.String("games-dir", "games", "folder holding one folder per game")
	_ = flag.Parse(args)

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
	slog.Info("database ready")

	signIn := accounts.Config{PublicURL: "http://" + *addr}
	if loaded, err := accounts.LoadConfig(*authConfigPath); err == nil {
		signIn = loaded
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	providers, err := signIn.Build()
	if err != nil {
		return err
	}
	slog.Info("sign-in configured", "public_url", signIn.PublicURL, "providers", len(providers))
	definition, err := platform.Load(filepath.Join(*easelDir, "server"))
	if err != nil {
		return err
	}
	catalog, err := platform.LoadCatalog(*easelDir)
	if err != nil {
		return err
	}
	manager := &games.Manager{Pool: databasePool, Catalog: catalog, Globals: definition.Libraries, Folder: *gamesDir}
	defer manager.Close()
	accountService := &accounts.Service{Pool: databasePool}
	serverApplication, err := manager.StartServer(ctx, definition, games.ServerHost{
		Users:           server.ScriptedUsersNotifying(accountService, manager.SyncServerPrincipal),
		AuthorizeClient: server.SignedInClient,
	})
	if err != nil {
		return fmt.Errorf("start server application %s: %w", definition.Server.ID(), err)
	}
	defer serverApplication.Close()
	slog.Info("server application started", "server", definition.Server.ID(), "libraries", len(definition.Libraries), "applications", len(catalog.Applications), "modules", len(catalog.Modules), "running games", len(manager.Running()))
	router, err := server.NewServerRouter(manager, serverApplication)
	if err != nil {
		return fmt.Errorf("serve server application %s: %w", definition.Server.ID(), err)
	}

	srv := &http.Server{
		Addr: *addr,
		Handler: server.NewHandler(server.Config{
			FrontendDir:   *easelDir,
			Router:        router,
			Accounts:      accountService,
			Providers:     providers,
			Policy:        router.Application,
			PublicURL:     signIn.PublicURL,
			SecureCookies: signIn.SecureCookies(),
			ReportError: func(r *http.Request, err error) {
				slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "error", err)
			},
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	errs := make(chan error, 1)
	go func() {
		slog.Info("starting Easel", "address", srv.Addr)
		errs <- srv.ListenAndServe()
	}()

	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
		stop()
		slog.Info("shutting down Easel")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		_ = srv.Close()
		return err
	}
	if err := <-errs; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
