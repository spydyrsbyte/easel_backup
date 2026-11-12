package session

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"easel/internal/automation"
	"easel/internal/manifest"
	"easel/internal/schema"
	"easel/internal/security"
)

func TestClientBridgeUsesExistingAuthorization(t *testing.T) {
	for _, deny := range []bool{false, true} {
		t.Run(map[bool]string{false: "allowed", true: "explicit deny"}[deny], func(t *testing.T) {
			service := &security.SecurityService{}
			config := securityConfig()
			config.Service = service
			policies := securityFile
			if deny {
				policies += `Security.registerPolicy("denyModify",{action:"modify",resource:"easel.test.Character",deny:{always:true}});`
			}
			s, err := NewGame(context.Background(), Game{GameID: "game", SessionID: "session", Security: config, Packages: application(t, policies, `Application.events.register("changed",{valid:3});`), AuthorizeClient: func(ctx context.Context, name string, payload json.RawMessage, delivery bool) error {
				e := security.Execution(ctx)
				if e.GameID != "game" || e.SessionID != "session" || e.Origin != "client" {
					return errors.New("incorrect trusted scope")
				}
				return service.Require(ctx, security.AuthorizationRequest{ResourceID: "record", Action: "modify"})
			}})
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			client := s.(ClientRuntime)
			alice := security.WithPrincipal(context.Background(), "alice")
			bob := security.WithPrincipal(context.Background(), "bob")
			if err := client.EmitAuthorizedClient(bob, "changed", json.RawMessage(`{}`)); !errors.Is(err, security.ErrDenied) {
				t.Fatal("unauthorized emission", err)
			}
			if _, err := client.SubscribeClient(bob, "changed", func(json.RawMessage) {}); !errors.Is(err, security.ErrDenied) {
				t.Fatal("unauthorized subscription", err)
			}
			err = client.EmitAuthorizedClient(alice, "changed", json.RawMessage(`{}`))
			if deny {
				if !errors.Is(err, security.ErrDenied) {
					t.Fatal("explicit deny failed", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			delivered := 0
			off, err := client.SubscribeClient(alice, "changed", func(json.RawMessage) { delivered++ })
			if err != nil {
				t.Fatal(err)
			}
			if err = s.EmitServer(bob, "changed", json.RawMessage(`{}`)); err != nil {
				t.Fatal(err)
			}
			if delivered != 1 {
				t.Fatal("recipient identity was not retained", delivered)
			}
			off()
			if err = s.EmitServer(bob, "changed", json.RawMessage(`{}`)); err != nil {
				t.Fatal(err)
			}
			if delivered != 1 {
				t.Fatal("unsubscription failed")
			}
		})
	}
}

type commitFailureRecords struct {
	*memoryRecords
	fail bool
}

type commitFailureTransaction struct {
	automation.Transaction
	store *commitFailureRecords
}

func (store *commitFailureRecords) Begin(ctx context.Context) (automation.Transaction, error) {
	tx, err := store.memoryRecords.Begin(ctx)
	return &commitFailureTransaction{Transaction: tx, store: store}, err
}

func (tx *commitFailureTransaction) Commit(ctx context.Context) error {
	if tx.store.fail {
		return errors.New("commit failed")
	}
	return tx.Transaction.Commit(ctx)
}

func TestClientDeliveryWaitsForSuccessfulCommit(t *testing.T) {
	pkg := newPackage(t, `{"type":"application","owner":"easel","host":"test","name":"application","server":{"application":{"entry":"main.mjs"},"data":[{".name":"State","value":{".type":"integer",".default":1}}]}}`, map[string]string{"main.mjs": `
Application.events.register("changed",{valid:1});
export function handleMessage(message) {
 const record=new easel.test.State();
 record.save();
 Application.events.emit("changed",{});
 if(message.abort)throw new Error("abort");
 return record.id;
}`})
	composed, err := schema.Compose([]manifest.Package{pkg})
	if err != nil {
		t.Fatal(err)
	}
	store := &commitFailureRecords{memoryRecords: &memoryRecords{schema: composed, rows: map[string]automation.Record{}}}
	runtime, err := NewGame(context.Background(), Game{Packages: []manifest.Package{pkg}, Records: store, AuthorizeClient: func(context.Context, string, json.RawMessage, bool) error { return nil }})
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	delivered := 0
	off, err := runtime.(ClientRuntime).SubscribeClient(context.Background(), "changed", func(json.RawMessage) {
		delivered++
		if len(store.rows) != 1 {
			t.Error("event arrived before committed records")
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	defer off()
	if _, err := runtime.Dispatch(context.Background(), json.RawMessage(`{"abort":true}`)); err == nil {
		t.Fatal("abort accepted")
	}
	if delivered != 0 || len(store.rows) != 0 {
		t.Fatal("aborted request became visible")
	}
	store.fail = true
	if _, err := runtime.Dispatch(context.Background(), json.RawMessage(`{}`)); err == nil {
		t.Fatal("commit failure ignored")
	}
	if delivered != 0 || len(store.rows) != 0 {
		t.Fatal("failed commit became visible")
	}
	store.fail = false
	if _, err := runtime.Dispatch(context.Background(), json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	if delivered != 1 {
		t.Fatal("successful request did not deliver")
	}
}
