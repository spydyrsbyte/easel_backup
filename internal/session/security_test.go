package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"testing/fstest"

	"easel/internal/automation"
	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/security"
)

type testSecurityStore struct {
	relationships map[security.Relationship]bool
}

func (s *testSecurityStore) Begin(context.Context) (security.Transaction, error) { return s, nil }
func (s *testSecurityStore) CheckRegistry(context.Context, string, string) error { return nil }
func (s *testSecurityStore) ResolvePrincipal(_ context.Context, id string) (security.Entity, error) {
	return security.Entity{ID: id, Type: "easel.easel.User", Attributes: map[string]any{"bootstrapAdministrator": id == "alice"}}, nil
}
func (s *testSecurityStore) ResolveEntity(_ context.Context, id string) (security.Entity, error) {
	if id != "record" {
		return security.Entity{}, fmt.Errorf("missing record")
	}
	return security.Entity{ID: id, Type: "easel.test.Character", Attributes: map[string]any{"locked": false}}, nil
}
func (s *testSecurityStore) HasRelationship(_ context.Context, a, b, c string) (bool, error) {
	return s.relationships[security.Relationship{SubjectID: a, Relation: b, ObjectID: c}], nil
}
func (s *testSecurityStore) QueryRelationships(_ context.Context, a, b string) ([]security.Relationship, error) {
	out := []security.Relationship{}
	for r := range s.relationships {
		if r.SubjectID == a && r.Relation == b {
			out = append(out, r)
		}
	}
	return out, nil
}
func (s *testSecurityStore) AddRelationship(_ context.Context, r security.Relationship) error {
	s.relationships[r] = true
	return nil
}
func (s *testSecurityStore) RemoveRelationship(_ context.Context, r security.Relationship) error {
	delete(s.relationships, r)
	return nil
}
func (s *testSecurityStore) Commit(context.Context) error   { return nil }
func (s *testSecurityStore) Rollback(context.Context) error { return nil }

func (s *testSecurityStore) QueryAssignments(context.Context, []string, string) ([]security.Assignment, error) {
	return nil, nil
}
func (s *testSecurityStore) SetAssignment(context.Context, security.Assignment) error    { return nil }
func (s *testSecurityStore) RemoveAssignment(context.Context, security.Assignment) error { return nil }
func (s *testSecurityStore) CreateGroup(context.Context, security.Entity) error          { return nil }
func (s *testSecurityStore) DeleteGroup(context.Context, string) error                   { return nil }

func securityConfig() *jsapi.SecurityConfig {
	return &jsapi.SecurityConfig{BuildID: "test", Store: &testSecurityStore{relationships: map[security.Relationship]bool{}}}
}

const securityFile = `
Security.registerAction("easel.test.Character","modify");
Security.registerAction("easel.test.Character","grant");
Security.registerAction("easel.test.Character","run");
Security.registerRelationship("control",{subject:"easel.easel.User",object:"easel.test.Character",addAction:"grant",removeAction:"grant"});
Security.registerPolicy("modify",{action:"modify",resource:"easel.test.Character",allow:{all:[{field:"principal.id",equals:"alice"},{field:"resource.attributes.locked",equals:false}]}});
Security.registerPolicy("grant",{action:"grant",resource:"easel.test.Character",allow:{field:"principal.id",equals:"alice"}});
Security.registerPolicy("run",{resource:"easel.test.Character",action:"run",allow:{always:true}});
`

const applicationFile = `
export function handleMessage(m){
 if(m.operation === "register")Application.security.registerPolicy("late",{action:"modify",resource:"easel.test.Character",allow:{always:true}});
 if(m.operation === "require")Application.security.require({resource:"record",action:"modify"});
 if(m.operation === "grant")Application.security.addRelationship({subject:"bob",relation:"control",object:"record"});
 return Application.security.can({resource:"record",action:"modify"});
}
`

func newPackage(t *testing.T, manifestJSON string, files map[string]string) manifest.Package {
	t.Helper()
	files[manifest.FileName] = manifestJSON
	system := fstest.MapFS{}
	for name, data := range files {
		system[name] = &fstest.MapFile{Data: []byte(data)}
	}
	p, err := manifest.Load(system)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func application(t *testing.T, securitySource, startup string, modules ...manifest.Package) []manifest.Package {
	t.Helper()
	files := map[string]string{"main.mjs": startup}
	stages := `"application":{"entry":"main.mjs"},"data":[{".name":"Character","locked":{".type":"boolean"}}]`
	if securitySource != "" {
		files["security.mjs"] = securitySource
		stages += `,"security":{"entry":"security.mjs"}`
	}
	return append([]manifest.Package{newPackage(t, `{"type":"application","name":"application","owner":"easel","host":"test","server":{`+stages+`}}`, files)}, modules...)
}

func TestSecurityLifecycleAndScriptIdentity(t *testing.T) {
	s, err := NewGame(context.Background(), Game{Packages: application(t, securityFile, applicationFile), Security: securityConfig()})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	call := func(principal, op string) (json.RawMessage, error) {
		return s.Dispatch(security.WithPrincipal(context.Background(), principal), json.RawMessage(`{"operation":"`+op+`"}`))
	}
	if value, err := call("alice", ""); err != nil || string(value) != "true" {
		t.Fatalf("authorized: %s %v", value, err)
	}
	if value, err := call("bob", ""); err != nil || string(value) != "false" {
		t.Fatalf("impersonation: %s %v", value, err)
	}
	if _, err := call("bob", "require"); err == nil {
		t.Fatal("require did not deny")
	}
	if _, err := call("alice", "grant"); err != nil {
		t.Fatal(err)
	}
	if _, err := call("bob", "grant"); err == nil {
		t.Fatal("script self grant accepted")
	}
	if _, err := call("alice", "register"); err == nil {
		t.Fatal("game code registered security definitions")
	}
}

func TestSecurityFilesRunInIsolation(t *testing.T) {
	for name, test := range map[string]struct {
		security string
		want     string
	}{
		"no game globals": {`Application.events.on("x",function(){});`, "Application is not defined"},
		"invalid policy":  {`Security.registerPolicy("bad",{resource:"easel.test.Character",action:"modify",allow:42});`, "module easel.test.application"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := NewGame(context.Background(), Game{Packages: application(t, test.security, ""), Security: securityConfig()})
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	if _, err := NewGame(context.Background(), Game{Packages: application(t, securityFile, "")}); err == nil {
		t.Fatal("security file ran without a security configuration")
	}
}

func TestLoadEventsRunInOrder(t *testing.T) {
	names := `["Load.Start","Load.Initialize","Load.Data.PreLoad","Load.Data.Ready","Load.Automation.PreLoad","Load.Automation.Ready","Load.Users.PreLoad","Load.Users.Ready","Load.Automation.Users.PreLoad","Load.Automation.Users.Ready","Load.Finish"]`
	source := `
let order = [];
` + names + `.reverse().forEach(function(name){
 Server.events.on(name,function(){order.push(name);});
});
export function handleMessage(){return order;}
`
	s, err := NewGame(context.Background(), Game{Packages: application(t, "", source)})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	value, err := s.Dispatch(context.Background(), json.RawMessage(`{}`))
	if err != nil || string(value) != names {
		t.Fatalf("order: %s %v", value, err)
	}
	if err := s.EmitServer(context.Background(), "Load.Start", json.RawMessage(`{}`)); err == nil {
		t.Fatal("load event emitted after loading")
	}
}

func TestEventsPreserveSecurityIdentity(t *testing.T) {
	source := `
Application.events.register("check",{valid:2});
Application.events.on("check",function(){Application.security.require({resource:"record",action:"modify"});});
`
	s, err := NewGame(context.Background(), Game{Packages: application(t, securityFile, applicationFile+source), Security: securityConfig()})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.EmitClient(security.WithPrincipal(context.Background(), "alice"), "check", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	if err := s.EmitClient(security.WithPrincipal(context.Background(), "bob"), "check", json.RawMessage(`{}`)); err == nil {
		t.Fatal("event bypassed identity")
	}
}

func securedAutomations(t *testing.T, repo automation.Repository) (*jsapi.SecurityConfig, *automation.Service) {
	t.Helper()
	service := &security.SecurityService{}
	access := security.AutomationAccess{Service: service, Request: func(string, automation.Saved) (security.AuthorizationRequest, error) {
		return security.AuthorizationRequest{ResourceID: "record", Action: "run"}, nil
	}}
	config := securityConfig()
	config.Service = service
	return config, automation.New(repo, nil, access)
}

func TestAutomationsPreservePrincipalThroughEvents(t *testing.T) {
	repo := &automation.FileRepository{Directory: t.TempDir()}
	if err := repo.Save(context.Background(), automation.Saved{Definition: automation.Definition{Name: "check", Steps: []automation.Step{{Op: "emit", Name: "check", Value: map[string]any{}}}}, Creator: automation.Creator{Kind: "system", ID: "application"}}); err != nil {
		t.Fatal(err)
	}
	config, automations := securedAutomations(t, repo)
	source := `
Application.events.register("check",{valid:4});
Application.events.on("check",function(){Application.security.require({resource:"record",action:"modify"});});
`
	s, err := NewGame(context.Background(), Game{Packages: application(t, securityFile, applicationFile+source), Security: config, AutomationService: automations})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.RunAutomation(security.WithPrincipal(context.Background(), "alice"), "check", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RunAutomation(security.WithPrincipal(context.Background(), "bob"), "check", nil); !errors.Is(err, automation.ErrPostCommit) {
		t.Fatalf("automation event escalated authority: %v", err)
	}
}

func TestSecuredAutomationsBindAtStartup(t *testing.T) {
	repo := &automation.FileRepository{Directory: t.TempDir()}
	game := automation.Saved{Definition: automation.Definition{Name: "react", Event: "ping", Steps: []automation.Step{{Op: "emit", Name: "pong", Value: map[string]any{}}}}, Creator: automation.Creator{Kind: "system", ID: "application"}}
	user := automation.Saved{Definition: automation.Definition{Name: "echo", Event: "ping", Steps: []automation.Step{{Op: "emit", Name: "pong", Value: map[string]any{}}}}, Creator: automation.Creator{Kind: "user", ID: "alice"}}
	config, automations := securedAutomations(t, repo)
	source := `
Application.events.register("ping",{valid:1});
Application.events.register("pong",{valid:4});
let pongs = 0;
Application.events.on("pong",function(){pongs++;});
export function handleMessage(){return pongs;}
`
	s, err := NewGame(context.Background(), Game{Packages: application(t, securityFile, source), Security: config, AutomationService: automations, Automations: []automation.Saved{game, user}})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.EmitServer(security.WithPrincipal(context.Background(), "alice"), "ping", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	value, err := s.Dispatch(context.Background(), json.RawMessage(`{}`))
	if err != nil || string(value) != "2" {
		t.Fatalf("seeded automations were not bound: %s %v", value, err)
	}
}

func TestSessionSuppliesExecutionScope(t *testing.T) {
	securitySource := `
Security.registerAction("easel.test.Character","modify");
Security.registerPolicy("scoped",{resource:"easel.test.Character",action:"modify",allow:{all:[{field:"context.game",equals:"game-1"},{field:"context.session",equals:"session-1"},{field:"context.origin",equals:"server"}]}});
`
	source := `export function handleMessage(){return Application.security.can({resource:"record",action:"modify"});}`
	s, err := NewGame(context.Background(), Game{GameID: "game-1", SessionID: "session-1", Packages: application(t, securitySource, source), Security: securityConfig()})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	value, err := s.Dispatch(security.WithPrincipal(context.Background(), "alice"), json.RawMessage(`{}`))
	if err != nil || string(value) != "true" {
		t.Fatalf("session scope: %s %v", value, err)
	}
}
