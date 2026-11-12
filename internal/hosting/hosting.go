package hosting

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"easel/internal/accounts"
	"easel/internal/database"
	"easel/internal/games"
	"easel/internal/packages"
	"easel/internal/platform"
	"easel/internal/server"
	"easel/internal/session"
	"github.com/jackc/pgx/v5/pgxpool"
)

const ServersFile = "servers.json"

type ServerConfig struct {
	Name      string `json:"name"`
	Addr      string `json:"addr"`
	Startup   string `json:"startup,omitempty"`
	PublicURL string `json:"public_url,omitempty"`
	Auth      string `json:"auth,omitempty"`
}

type Shared struct {
	Pool        *pgxpool.Pool
	EaselDir    string
	GamesDir    string
	ConfigDir   string
	Slots       *games.Slots
	Installer   *packages.Installer
	Preferences string
	FileLimit   int64
	ReportError func(*http.Request, error)
	Lost        func(server string, games []string, cause error)
}

type Server struct {
	Config     ServerConfig
	ID         string
	Definition *platform.Definition
	Manager    *games.Manager
	Accounts   *accounts.Service
	Runtime    session.ServerRuntime
	Handler    http.Handler
	PublicURL  string
	Providers  int
}

func LoadServers(configDir, defaultAddr, defaultAuth string) ([]ServerConfig, error) {
	file := filepath.Join(configDir, ServersFile)
	data, err := os.ReadFile(file)
	if errors.Is(err, fs.ErrNotExist) {
		return []ServerConfig{{Name: database.DefaultServerName, Addr: defaultAddr, Auth: defaultAuth}}, nil
	}
	if err != nil {
		return nil, err
	}
	var settings struct {
		Servers []ServerConfig `json:"servers"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&settings); err != nil {
		return nil, fmt.Errorf("invalid %s: %w", file, err)
	}
	if len(settings.Servers) == 0 {
		return nil, fmt.Errorf("%s lists no servers", file)
	}
	names, addresses := map[string]bool{}, map[string]bool{}
	for index := range settings.Servers {
		entry := &settings.Servers[index]
		if !database.ValidServerName(entry.Name) {
			return nil, fmt.Errorf("%s: server name %q must be 1 to 32 lowercase letters, digits, underscores, or dashes", file, entry.Name)
		}
		if entry.Addr == "" {
			return nil, fmt.Errorf("%s: server %s needs an addr to listen on", file, entry.Name)
		}
		if names[entry.Name] {
			return nil, fmt.Errorf("%s: server %s is listed twice", file, entry.Name)
		}
		if addresses[entry.Addr] {
			return nil, fmt.Errorf("%s: two servers listen on %s", file, entry.Addr)
		}
		names[entry.Name], addresses[entry.Addr] = true, true
		if entry.Auth != "" && !filepath.IsAbs(entry.Auth) {
			entry.Auth = filepath.Join(configDir, entry.Auth)
		}
	}
	return settings.Servers, nil
}

func cookieName(name string) string {
	if name == database.DefaultServerName {
		return "easel_session"
	}
	return "easel_session_" + name
}

func Start(ctx context.Context, shared Shared, config ServerConfig) (*Server, error) {
	id, err := database.EnsureServer(ctx, shared.Pool, config.Name)
	if err != nil {
		return nil, err
	}
	signIn := accounts.Config{}
	if config.Auth != "" {
		loaded, err := accounts.LoadConfig(config.Auth)
		if err == nil {
			signIn = loaded
		} else if !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("server %s: %w", config.Name, err)
		}
	}
	if config.PublicURL != "" {
		signIn.PublicURL = config.PublicURL
	}
	if signIn.PublicURL == "" {
		signIn.PublicURL = "http://" + config.Addr
	}
	providers, err := signIn.Build()
	if err != nil {
		return nil, fmt.Errorf("server %s: %w", config.Name, err)
	}
	definition, err := platform.LoadStartup(filepath.Join(shared.EaselDir, "server"), config.Startup)
	if err != nil {
		return nil, fmt.Errorf("server %s: %w", config.Name, err)
	}
	catalog, err := platform.LoadCatalog(shared.EaselDir)
	if err != nil {
		return nil, err
	}
	manager := &games.Manager{Pool: shared.Pool, Catalog: catalog, Globals: definition.Libraries, Folder: shared.GamesDir, ServerID: id, Slots: shared.Slots, FileLimit: shared.FileLimit}
	if shared.Installer != nil {
		manager.Packages = &games.PackageControl{Installer: shared.Installer, Preferences: shared.Preferences}
	}
	if shared.Lost != nil {
		manager.OwnershipLost = func(lost []string, cause error) { shared.Lost(config.Name, lost, cause) }
	}
	service := &accounts.Service{Pool: shared.Pool, ServerID: id}
	runtime, err := manager.StartServer(ctx, definition, games.ServerHost{
		Users:           server.ScriptedUsersNotifying(service, manager.SyncServerPrincipal),
		AuthorizeClient: server.SignedInClient,
	})
	if err != nil {
		manager.Close()
		return nil, fmt.Errorf("server %s: start server application %s: %w", config.Name, definition.Server.ID(), err)
	}
	router, err := server.NewServerRouter(manager, runtime)
	if err != nil {
		runtime.Close()
		manager.Close()
		return nil, fmt.Errorf("server %s: serve server application %s: %w", config.Name, definition.Server.ID(), err)
	}
	handler := server.NewHandler(server.Config{
		FrontendDir:   shared.EaselDir,
		Router:        router,
		Accounts:      service,
		Providers:     providers,
		Policy:        router.Application,
		PublicURL:     signIn.PublicURL,
		SecureCookies: signIn.SecureCookies(),
		CookieName:    cookieName(config.Name),
		ReportError:   shared.ReportError,
	})
	return &Server{Config: config, ID: id, Definition: definition, Manager: manager, Accounts: service, Runtime: runtime, Handler: handler, PublicURL: signIn.PublicURL, Providers: len(providers)}, nil
}

func (s *Server) Close() {
	s.Manager.Close()
	s.Runtime.Close()
}
