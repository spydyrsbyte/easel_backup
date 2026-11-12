package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"testing"
	"time"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
)

func TestPathfinderBrowser(t *testing.T) {
	if os.Getenv("EASEL_PLAYWRIGHT_MODULE") == "" {
		t.Skip("set EASEL_PLAYWRIGHT_MODULE for browser acceptance")
	}
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	service := &accounts.Service{Pool: pool}
	application := serverApplication(t, "../../server/easel/server", manager.Scripting(), ScriptedUsers(service))
	router, err := NewServerRouter(manager, application)
	if err != nil {
		t.Fatal(err)
	}
	site := httptest.NewUnstartedServer(nil)
	handler := NewHandler(Config{FrontendDir: "../../server/easel", Accounts: service, Policy: application, Router: router, PublicURL: "http://" + site.Listener.Addr().String(), ReportError: func(_ *http.Request, err error) { t.Log(err) }})
	site.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/_test/restart-pathfinder" {
			handler.ServeHTTP(w, r)
			return
		}
		listed, err := manager.List(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		for _, game := range listed {
			if game.Application != "easel.pf1e.game" {
				continue
			}
			if err := manager.Stop(game.ID); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if err := manager.Start(r.Context(), game.ID); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.Error(w, "Pathfinder game not found", http.StatusNotFound)
	})
	site.Start()
	defer site.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, "node", "../../scripts/test-pf1e-browser.mjs", site.URL)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("browser: %v\n%s", err, output)
	} else {
		t.Log(string(output))
	}
}
