package server

import (
	"context"
	"net/http/httptest"
	"os"
	"os/exec"
	"testing"
	"time"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
	"easel/internal/files"
)

const inviteOnly = `
Server.auth.on("signIn", (signIn) => signIn.allow());
Server.auth.on("signUp", (signUp) => signUp.challenge("invite"));
Server.auth.on("response", (response) => response.challengeName === "invite" && response.value === "letmein" ? response.allow() : response.refuse("Invalid invite."));
`

func TestBrowserChallenge(t *testing.T) {
	if os.Getenv("EASEL_PLAYWRIGHT_MODULE") == "" {
		t.Skip("set EASEL_PLAYWRIGHT_MODULE to playwright/index.mjs for browser acceptance")
	}
	pool := dbtest.Open(t)
	g, err := NewDemoGame(context.Background(), "../../server/easel", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Runtime.Close()
	g.Files = &files.Store{Folder: t.TempDir()}
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: &accounts.Service{Pool: pool}, Policy: hookedServer(t, inviteOnly), Router: SingleGame(g), PublicURL: "http://" + site.Listener.Addr().String()})
	site.Start()
	defer site.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", "../../scripts/test-challenge-browser.mjs", site.URL)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("browser: %v\n%s", err, output)
	} else {
		t.Log(string(output))
	}
}
