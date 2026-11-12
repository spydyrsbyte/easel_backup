package security

import (
	"context"
	"errors"
	"strings"
	"testing"

	"easel/internal/automation"
	"easel/internal/automation/pgstore"
	"easel/internal/database"
	"easel/internal/database/dbtest"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestPostgresSharedStateAndSerializableEnforcement(t *testing.T) {
	pool := dbtest.Open(t)
	ctx := context.Background()
	const game = "10000000-0000-0000-0000-000000000001"
	const contributor = "10000000-0000-0000-0000-000000000002"
	const alice = "10000000-0000-0000-0000-000000000003"
	const bob = "10000000-0000-0000-0000-000000000004"
	const resource = "10000000-0000-0000-0000-000000000005"

	_, err := pool.Exec(ctx, `BEGIN;
 INSERT INTO game_data.games(game_id,name,application_id) VALUES('`+game+`','security test','`+contributor+`');
 INSERT INTO game_data.contributors(game_id,contributor_id,kind,name) VALUES('`+game+`','`+contributor+`','application','test');
 INSERT INTO game_data.security_principals(game_id,id,principal_type) VALUES('`+game+`','`+alice+`','easel.easel.User'),('`+game+`','`+bob+`','easel.easel.User');
 CREATE TABLE game_data.security_test_records(game_id uuid,id uuid,locked boolean,PRIMARY KEY(game_id,id));
 INSERT INTO game_data.security_test_records VALUES('`+game+`','`+resource+`',false);
 COMMIT;`)
	if err != nil {
		t.Fatal(err)
	}
	resolver := func(ctx context.Context, tx pgx.Tx, game, id string) (Entity, error) {
		var locked bool
		err := tx.QueryRow(ctx, `SELECT locked FROM game_data.security_test_records WHERE game_id=$1 AND id=$2`, game, id).Scan(&locked)
		return Entity{ID: id, Type: "Character", Attributes: map[string]any{"locked": locked}}, err
	}
	store := &PostgresStore{Pool: pool, GameID: game, ResolveRecord: resolver}
	source := equals("principal.id", alice)
	r := initializedRegistry(t, func(r *Registry) error {
		for _, resource := range []string{"Character", "app.Group"} {
			for _, action := range []string{"modify", "grant", "revoke", "create", "delete", "membership"} {
				if err := r.RegisterAction("app", resource, action); err != nil {
					return err
				}
			}
		}
		if err := r.RegisterGroup("app", "app.Group", GroupDefinition{CreateAction: "create", DeleteAction: "delete"}); err != nil {
			return err
		}
		if err := r.RegisterRelationship("app", "control", RelationshipDefinition{Subject: "easel.easel.User", Object: "Character", AddAction: "grant", RemoveAction: "revoke"}); err != nil {
			return err
		}
		if err := r.RegisterRelationship("app", "member", RelationshipDefinition{Subject: "easel.easel.User", Object: "app.Group", AddAction: "membership", RemoveAction: "membership", Membership: true}); err != nil {
			return err
		}
		if err := r.RegisterPermission("app", "character.modify", Permission{Resource: "Character", Action: "modify", Configurable: true, TypeScope: true, InstanceScope: true, ManageAction: "grant"}); err != nil {
			return err
		}
		if err := r.RegisterPolicy("app", "modify", modify(control)); err != nil {
			return err
		}
		for _, resource := range []string{"Character", "app.Group"} {
			for _, action := range []string{"grant", "revoke", "create", "delete", "membership"} {
				if err := r.RegisterPolicy("app", resource+action, Policy{Resource: resource, Action: action, Allow: &source}); err != nil {
					return err
				}
			}
		}
		return nil
	})
	a := &SecurityService{Registry: r, Store: store}
	b := *a
	b.Store = &PostgresStore{Pool: pool, GameID: game, ResolveRecord: resolver}
	fingerprint, _ := a.Registry.Fingerprint()
	if err := store.CheckRegistry(ctx, "build", fingerprint); err != nil {
		t.Fatal(err)
	}
	if err := b.Store.CheckRegistry(ctx, "build", fingerprint); err != nil {
		t.Fatal(err)
	}
	if err := store.CheckRegistry(ctx, "build", strings.Repeat("0", 64)); err == nil {
		t.Fatal("incompatible server accepted")
	}
	if err := store.CheckRegistry(ctx, "different-build", strings.Repeat("0", 64)); err == nil {
		t.Fatal("running game mixed incompatible published builds")
	}
	relation := Relationship{bob, "control", resource}
	aliceContext, err := WithExecution(ctx, ExecutionContext{PrincipalID: alice, GameID: game, SessionID: "test", Origin: "server"})
	if err != nil {
		t.Fatal(err)
	}
	bobContext, err := WithExecution(ctx, ExecutionContext{PrincipalID: bob, GameID: game, SessionID: "test", Origin: "client"})
	if err != nil {
		t.Fatal(err)
	}
	req := AuthorizationRequest{ResourceID: resource, Action: "modify"}
	if err := a.ChangeRelationship(bobContext, relation, true); !errors.Is(err, ErrDenied) {
		t.Fatalf("unauthorized self grant: %v", err)
	}
	if err := a.ChangeRelationship(aliceContext, relation, true); err != nil {
		t.Fatal(err)
	}
	d, err := b.Authorize(bobContext, req)
	if err != nil || !d.Allowed {
		t.Fatalf("other server did not observe grant: %+v %v", d, err)
	}

	tx, err := store.Begin(bobContext)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err := a.RequireIn(bobContext, tx, req); err != nil {
		t.Fatal(err)
	}
	if err := b.ChangeRelationship(aliceContext, relation, false); err != nil {
		t.Fatal(err)
	}
	raw := tx.(*PostgresTransaction)
	_, err = raw.Tx.Exec(ctx, `UPDATE game_data.security_test_records SET locked=true WHERE game_id=$1 AND id=$2`, game, resource)
	if err == nil {
		err = tx.Commit(ctx)
	}
	var serialization *pgconn.PgError
	if !errors.As(err, &serialization) || serialization.Code != "40001" {
		t.Fatalf("expected serialization failure, got %v", err)
	}
	for _, server := range []*SecurityService{a, &b} {
		d, err := server.Authorize(bobContext, req)
		if err != nil || d.Allowed {
			t.Fatalf("revocation not visible: %+v %v", d, err)
		}
	}
	if err := a.ChangeRelationship(aliceContext, relation, true); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE game_data.security_test_records SET locked=true WHERE game_id=$1 AND id=$2`, game, resource); err != nil {
		t.Fatal(err)
	}
	d, err = b.Authorize(bobContext, req)
	if err != nil || d.Allowed {
		t.Fatalf("authoritative attribute change ignored: %+v %v", d, err)
	}
	checkTx, err := database.BeginSerializable(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	err = store.RecordAuthorizer(a)(bobContext, checkTx, "modify", automation.Record{ID: resource, Type: "Character", Data: map[string]any{"locked": false}})
	_ = checkTx.Rollback(ctx)
	if !errors.Is(err, ErrDenied) {
		t.Fatalf("automation record attributes replaced authoritative state: %v", err)
	}
	mapping := func(action string, _ automation.Saved) (AuthorizationRequest, error) {
		return AuthorizationRequest{ResourceID: resource, Action: "grant", Context: map[string]any{"automationAction": action}}, nil
	}
	repository := &pgstore.Repository{Pool: pool, GameID: game, AuthorizeWrite: store.AutomationAuthorizer(a, mapping)}
	saved := automation.Saved{Creator: automation.Creator{Kind: "system", ID: "application"}, Definition: automation.Definition{Name: "test", Steps: []automation.Step{{Op: "return", Value: true}}}}
	if err := repository.Save(bobContext, saved); !errors.Is(err, ErrDenied) {
		t.Fatalf("direct automation save bypassed authorization: %v", err)
	}
	if err := repository.Save(aliceContext, saved); err != nil {
		t.Fatal(err)
	}
	if err := repository.Delete(bobContext, "test"); !errors.Is(err, ErrDenied) {
		t.Fatalf("direct automation delete bypassed authorization: %v", err)
	}
	if err := repository.Delete(aliceContext, "test"); err != nil {
		t.Fatal(err)
	}
	if err := a.ChangeRelationship(aliceContext, relation, false); err != nil {
		t.Fatal(err)
	}
	const group = "10000000-0000-0000-0000-000000000006"
	if err := a.CreateGroup(aliceContext, Entity{ID: group, Type: "app.Group", Attributes: map[string]any{"name": "players"}}); err != nil {
		t.Fatal(err)
	}
	if err := b.ChangeRelationship(aliceContext, Relationship{bob, "member", group}, true); err != nil {
		t.Fatal(err)
	}
	assignment := Assignment{PrincipalID: group, Permission: "character.modify", Effect: "allow"}
	if err := a.ChangeAssignment(aliceContext, assignment, false); err != nil {
		t.Fatal(err)
	}
	d, err = b.Authorize(bobContext, req)
	if err != nil || !d.Allowed {
		t.Fatalf("cross-server group assignment: %+v %v", d, err)
	}
	denial := Assignment{PrincipalID: bob, Permission: "character.modify", ResourceID: resource, Effect: "deny"}
	if err := b.ChangeAssignment(aliceContext, denial, false); err != nil {
		t.Fatal(err)
	}
	d, err = a.Authorize(bobContext, req)
	if err != nil || d.Allowed {
		t.Fatalf("cross-server explicit denial: %+v %v", d, err)
	}
	if err := a.ChangeAssignment(aliceContext, denial, true); err != nil {
		t.Fatal(err)
	}
	d, err = b.Authorize(bobContext, req)
	if err != nil || !d.Allowed {
		t.Fatalf("denial removal: %+v %v", d, err)
	}
	if err := b.DeleteGroup(aliceContext, group); err != nil {
		t.Fatal(err)
	}
	d, err = a.Authorize(bobContext, req)
	if err != nil || d.Allowed {
		t.Fatalf("group deletion retained authority: %+v %v", d, err)
	}
}
