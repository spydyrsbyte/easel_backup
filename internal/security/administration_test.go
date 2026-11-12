package security

import (
	"context"
	"errors"
	"testing"
)

func adminService(t *testing.T) (*SecurityService, *memoryStore) {
	t.Helper()
	r := initializedRegistry(t, func(r *Registry) error {
		for _, resource := range []string{"Character", "module.Group"} {
			for _, action := range []string{"modify", "manage", "create", "delete", "membership"} {
				if err := r.RegisterAction("module", resource, action); err != nil {
					return err
				}
			}
		}
		if err := r.RegisterGroup("module", "module.Group", GroupDefinition{CreateAction: "create", DeleteAction: "delete"}); err != nil {
			return err
		}
		if err := r.RegisterRelationship("module", "member", RelationshipDefinition{Subject: "easel.easel.User", Object: "module.Group", AddAction: "membership", RemoveAction: "membership", Membership: true}); err != nil {
			return err
		}
		if err := r.RegisterRelationship("module", "nested", RelationshipDefinition{Subject: "module.Group", Object: "module.Group", AddAction: "membership", RemoveAction: "membership", Membership: true}); err != nil {
			return err
		}
		for _, p := range []struct {
			name       string
			permission Permission
		}{
			{"character.modify", Permission{Resource: "Character", Action: "modify", Configurable: true, TypeScope: true, InstanceScope: true, ManageAction: "manage"}},
			{"character.manage", Permission{Resource: "Character", Action: "manage", Configurable: true, InstanceScope: true, ManageAction: "manage"}},
			{"fixed", Permission{Resource: "Character", Action: "delete"}},
		} {
			if err := r.RegisterPermission("module", p.name, p.permission); err != nil {
				return err
			}
		}
		for _, resource := range []string{"Character", "module.Group"} {
			for _, action := range []string{"manage", "create", "delete", "membership"} {
				if err := r.RegisterPolicy("module", resource+"."+action, Policy{Resource: resource, Action: action, Allow: &isAlice}); err != nil {
					return err
				}
			}
		}
		return nil
	})
	store := newMemory()
	return &SecurityService{Registry: r, Store: store}, store
}

func TestAdministrativeAssignmentsAndGroupMembership(t *testing.T) {
	s, _ := adminService(t)
	alice := WithPrincipal(context.Background(), "alice")
	bob := WithPrincipal(context.Background(), "bob")
	before, _ := s.Registry.Fingerprint()
	if decision(t, s, "alice") {
		t.Fatal("administrator automatically gained ordinary access")
	}
	a := Assignment{PrincipalID: "bob", Permission: "character.modify", ResourceID: "record", Effect: "allow"}
	if err := s.ChangeAssignment(bob, a, false); !errors.Is(err, ErrDenied) {
		t.Fatalf("unauthorized self assignment: %v", err)
	}
	if err := s.ChangeAssignment(alice, a, false); err != nil {
		t.Fatal(err)
	}
	if !decision(t, s, "bob") {
		t.Fatal("instance permission did not grant")
	}
	a.Effect = "deny"
	if err := s.ChangeAssignment(alice, a, false); err != nil {
		t.Fatal(err)
	}
	if decision(t, s, "bob") {
		t.Fatal("explicit deny did not revoke allow")
	}
	if err := s.ChangeAssignment(alice, a, true); err != nil {
		t.Fatal(err)
	}
	if decision(t, s, "bob") {
		t.Fatal("removal restored old allow")
	}
	a.PrincipalID = "group"
	a.ResourceID = ""
	a.Effect = "allow"
	if err := s.ChangeAssignment(alice, a, false); err != nil {
		t.Fatal(err)
	}
	if decision(t, s, "bob") {
		t.Fatal("nonmember inherited group permission")
	}
	if err := s.ChangeRelationship(bob, Relationship{"bob", "member", "group"}, true); !errors.Is(err, ErrDenied) {
		t.Fatalf("unauthorized membership: %v", err)
	}
	if err := s.ChangeRelationship(alice, Relationship{"bob", "member", "group"}, true); err != nil {
		t.Fatal(err)
	}
	if !decision(t, s, "bob") {
		t.Fatal("group assignment did not grant")
	}
	denied := Assignment{PrincipalID: "bob", Permission: "character.modify", ResourceID: "record", Effect: "deny"}
	if err := s.ChangeAssignment(alice, denied, false); err != nil {
		t.Fatal(err)
	}
	if decision(t, s, "bob") {
		t.Fatal("user deny did not override group allow")
	}
	if err := s.ChangeAssignment(alice, denied, true); err != nil {
		t.Fatal(err)
	}
	if err := s.ChangeRelationship(alice, Relationship{"bob", "member", "group"}, false); err != nil {
		t.Fatal(err)
	}
	if decision(t, s, "bob") {
		t.Fatal("revoked membership remained effective")
	}
	if err := s.ChangeAssignment(alice, Assignment{PrincipalID: "bob", Permission: "fixed", ResourceID: "record", Effect: "allow"}, false); err == nil {
		t.Fatal("nonconfigurable permission changed")
	}
	if err := s.ChangeAssignment(alice, Assignment{PrincipalID: "bob", Permission: "character.manage", Effect: "allow"}, false); err == nil {
		t.Fatal("unsupported type scope accepted")
	}
	after, _ := s.Registry.Fingerprint()
	if before != after {
		t.Fatal("runtime administration changed definitions")
	}
}

func TestGroupsAndCyclicMembership(t *testing.T) {
	s, _ := adminService(t)
	alice := WithPrincipal(context.Background(), "alice")
	bob := WithPrincipal(context.Background(), "bob")
	group := Entity{ID: "group2", Type: "module.Group", Attributes: map[string]any{"name": "second"}}
	if err := s.CreateGroup(bob, group); !errors.Is(err, ErrDenied) {
		t.Fatalf("unauthorized group creation: %v", err)
	}
	if err := s.CreateGroup(alice, group); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateGroup(alice, group); err == nil {
		t.Fatal("group replaced existing identity")
	}
	if err := s.CreateGroup(alice, Entity{ID: "record", Type: "module.Group"}); err == nil {
		t.Fatal("group API converted a record into a principal")
	}
	for _, r := range []Relationship{{"bob", "member", "group"}, {"group", "nested", "group2"}, {"group2", "nested", "group"}} {
		if err := s.ChangeRelationship(alice, r, true); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.ChangeAssignment(alice, Assignment{PrincipalID: "group2", Permission: "character.modify", Effect: "allow"}, false); err != nil {
		t.Fatal(err)
	}
	if !decision(t, s, "bob") {
		t.Fatal("nested group assignment did not grant")
	}
	if err := s.DeleteGroup(bob, "group2"); !errors.Is(err, ErrDenied) {
		t.Fatalf("unauthorized deletion: %v", err)
	}
	if err := s.DeleteGroup(alice, "bob"); err == nil {
		t.Fatal("group API deleted ordinary principal")
	}
	if err := s.DeleteGroup(alice, "group2"); err != nil {
		t.Fatal(err)
	}
}

func TestPolicyAndAssignmentDenialsShareEngine(t *testing.T) {
	s, store := adminService(t)

	r := initializedRegistry(t, func(r *Registry) error {
		for _, action := range []string{"modify", "manage"} {
			if err := r.RegisterAction("module", "Character", action); err != nil {
				return err
			}
		}
		if err := r.RegisterPermission("module", "character.modify", Permission{Resource: "Character", Action: "modify", Configurable: true, InstanceScope: true, ManageAction: "manage"}); err != nil {
			return err
		}
		if err := r.RegisterPolicy("module", "allow", modify(isAlice)); err != nil {
			return err
		}
		return r.RegisterPolicy("module", "restrict", Policy{Resource: "Character", Action: "modify", Deny: &isBob})
	})
	s.Registry = r
	store.assignments[Assignment{PrincipalID: "bob", Permission: "character.modify", ResourceID: "record", Effect: "allow"}] = true
	if decision(t, s, "bob") {
		t.Fatal("assignment bypassed registered denial")
	}
	store.assignments[Assignment{PrincipalID: "alice", Permission: "character.modify", ResourceID: "record", Effect: "deny"}] = true
	if decision(t, s, "alice") {
		t.Fatal("policy bypassed runtime denial")
	}
}

func TestDelegatedAdministrationRemainsScoped(t *testing.T) {
	s, _ := adminService(t)
	alice := WithPrincipal(context.Background(), "alice")
	bob := WithPrincipal(context.Background(), "bob")
	if err := s.ChangeAssignment(alice, Assignment{PrincipalID: "bob", Permission: "character.manage", ResourceID: "record", Effect: "allow"}, false); err != nil {
		t.Fatal(err)
	}
	if err := s.ChangeAssignment(bob, Assignment{PrincipalID: "bob", Permission: "character.modify", ResourceID: "record", Effect: "allow"}, false); err != nil {
		t.Fatalf("delegated management failed: %v", err)
	}
	if !decision(t, s, "bob") {
		t.Fatal("delegated instance grant failed")
	}
	if err := s.ChangeAssignment(bob, Assignment{PrincipalID: "bob", Permission: "character.modify", Effect: "allow"}, false); !errors.Is(err, ErrDenied) {
		t.Fatalf("instance administrator escaped to type scope: %v", err)
	}
}

func TestTrustedExecutionAttributesSnapshot(t *testing.T) {
	s, _ := testService(t, map[string]Policy{"p": modify(Rule{All: []Rule{equals("context.attributes.region", "trusted"), equals("context.game", "game"), equals("context.session", "session"), equals("context.origin", "client")}})})
	attrs := map[string]any{"region": "trusted"}
	ctx, err := WithExecution(context.Background(), ExecutionContext{PrincipalID: "alice", GameID: "game", SessionID: "session", Origin: "client", Attributes: attrs})
	if err != nil {
		t.Fatal(err)
	}
	attrs["region"] = "changed"
	d, err := s.Authorize(ctx, AuthorizationRequest{ResourceID: "record", Action: "modify", Context: map[string]any{"region": "attacker"}})
	if err != nil || !d.Allowed {
		t.Fatalf("trusted execution context: %+v %v", d, err)
	}
}
