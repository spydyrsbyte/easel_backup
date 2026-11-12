package session

import (
	"context"
	"os"
	"testing"

	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/schema"
	"easel/internal/security"
)

type pf1eTestStore struct {
	relationships map[security.Relationship]bool
}

func (s *pf1eTestStore) Begin(context.Context) (security.Transaction, error) { return s, nil }
func (s *pf1eTestStore) CheckRegistry(context.Context, string, string) error { return nil }
func (s *pf1eTestStore) ResolvePrincipal(_ context.Context, id string) (security.Entity, error) {
	role := "player"
	if id == "alice" {
		role = "administrator"
	}
	return security.Entity{
		ID:         id,
		Type:       "easel.easel.User",
		Attributes: map[string]any{"role": role},
	}, nil
}
func (s *pf1eTestStore) ResolveEntity(_ context.Context, id string) (security.Entity, error) {
	switch id {
	case "npc-1":
		return security.Entity{
			ID:         id,
			Type:       "easel.pf1e.NPC",
			Attributes: map[string]any{"ownerUserId": "alice"},
		}, nil
	case "weapon-1":
		return security.Entity{
			ID:         id,
			Type:       "easel.pf1e.Weapon",
			Attributes: map[string]any{"ownerUserId": "bob"},
		}, nil
	case "race-1":
		return security.Entity{
			ID:         id,
			Type:       "easel.pf1e.Race",
			Attributes: map[string]any{},
		}, nil
	default:
		return security.Entity{
			ID:         id,
			Type:       "easel.pf1e.Character",
			Attributes: map[string]any{"ownerUserId": "bob"},
		}, nil
	}
}
func (s *pf1eTestStore) HasRelationship(_ context.Context, a, b, c string) (bool, error) {
	return s.relationships[security.Relationship{SubjectID: a, Relation: b, ObjectID: c}], nil
}
func (s *pf1eTestStore) QueryRelationships(_ context.Context, a, b string) ([]security.Relationship, error) {
	out := []security.Relationship{}
	for r := range s.relationships {
		if r.SubjectID == a && r.Relation == b {
			out = append(out, r)
		}
	}
	return out, nil
}
func (s *pf1eTestStore) AddRelationship(_ context.Context, r security.Relationship) error {
	s.relationships[r] = true
	return nil
}
func (s *pf1eTestStore) RemoveRelationship(_ context.Context, r security.Relationship) error {
	delete(s.relationships, r)
	return nil
}
func (s *pf1eTestStore) Commit(context.Context) error   { return nil }
func (s *pf1eTestStore) Rollback(context.Context) error { return nil }
func (s *pf1eTestStore) QueryAssignments(context.Context, []string, string) ([]security.Assignment, error) {
	return nil, nil
}
func (s *pf1eTestStore) SetAssignment(context.Context, security.Assignment) error    { return nil }
func (s *pf1eTestStore) RemoveAssignment(context.Context, security.Assignment) error { return nil }
func (s *pf1eTestStore) CreateGroup(context.Context, security.Entity) error          { return nil }
func (s *pf1eTestStore) DeleteGroup(context.Context, string) error                   { return nil }

func TestPF1eSecurityPolicies(t *testing.T) {
	pkg, err := manifest.Load(os.DirFS("../../server/easel/modules/pf1e"))
	if err != nil {
		t.Fatalf("load pf1e: %v", err)
	}
	vtt := vttModule(t)
	composedSchema, err := schema.Compose([]manifest.Package{vtt, pkg})
	if err != nil {
		t.Fatalf("compose: %v", err)
	}

	store := &pf1eTestStore{relationships: map[security.Relationship]bool{}}
	config := &jsapi.SecurityConfig{BuildID: "pf1e-test", Store: store}
	entries := []manifest.Entry{
		{Package: vtt, Path: "server/security.mjs"},
		{
			Package: pkg,
			Path:    "server/security.mjs",
		},
	}

	service, err := jsapi.BuildSecurity(context.Background(), config, "", entries, composedSchema)
	if err != nil {
		t.Fatalf("BuildSecurity failed: %v", err)
	}

	gmCtx := security.WithPrincipal(context.Background(), "alice")
	playerCtx := security.WithPrincipal(context.Background(), "bob")
	charlieCtx := security.WithPrincipal(context.Background(), "charlie")

	decision, err := service.Authorize(gmCtx, security.AuthorizationRequest{
		ResourceID: "char-1",
		Action:     "manage",
	})
	if err != nil || !decision.Allowed {
		t.Errorf("gm manage should be allowed: %v, allowed=%v", err, decision.Allowed)
	}

	decision, err = service.Authorize(playerCtx, security.AuthorizationRequest{
		ResourceID: "char-1",
		Action:     "read",
	})
	if err != nil || !decision.Allowed {
		t.Errorf("player read should be allowed: %v, allowed=%v", err, decision.Allowed)
	}

	decision, err = service.Authorize(playerCtx, security.AuthorizationRequest{
		ResourceID: "char-1",
		Action:     "modify",
	})
	if err != nil || !decision.Allowed {
		t.Errorf("actor owner modify should be allowed: %v, allowed=%v", err, decision.Allowed)
	}

	decision, err = service.Authorize(playerCtx, security.AuthorizationRequest{
		ResourceID: "char-1",
		Action:     "delete",
	})
	if err != nil || !decision.Allowed {
		t.Errorf("actor owner delete should be allowed: %v, allowed=%v", err, decision.Allowed)
	}

	decision, err = service.Authorize(charlieCtx, security.AuthorizationRequest{
		ResourceID: "char-1",
		Action:     "modify",
	})
	if err != nil {
		t.Fatalf("charlie modify error: %v", err)
	}
	if !decision.Allowed {
		t.Errorf("players pass the hard rule; actor roles are enforced by the game: non-owner non-gm modify")
	}

	decision, err = service.Authorize(charlieCtx, security.AuthorizationRequest{
		ResourceID: "char-1",
		Action:     "delete",
	})
	if err != nil {
		t.Fatalf("charlie delete error: %v", err)
	}
	if !decision.Allowed {
		t.Errorf("players pass the hard rule; actor roles are enforced by the game: non-owner non-gm delete")
	}

	decision, err = service.Authorize(playerCtx, security.AuthorizationRequest{
		ResourceID: "char-1",
		Action:     "manage",
	})
	if err != nil {
		t.Fatalf("player manage error: %v", err)
	}
	if decision.Allowed {
		t.Errorf("player manage should be denied for non-admin")
	}

	decision, err = service.Authorize(charlieCtx, security.AuthorizationRequest{
		ResourceID: "npc-1",
		Action:     "modify",
	})
	if err != nil {
		t.Fatalf("charlie npc modify error: %v", err)
	}
	if !decision.Allowed {
		t.Errorf("players pass the hard rule; actor roles are enforced by the game: non-owner non-gm npc modify")
	}

	decision, err = service.Authorize(gmCtx, security.AuthorizationRequest{
		ResourceID: "npc-1",
		Action:     "modify",
	})
	if err != nil || !decision.Allowed {
		t.Errorf("gm npc modify should be allowed: %v, allowed=%v", err, decision.Allowed)
	}

	decision, err = service.Authorize(playerCtx, security.AuthorizationRequest{
		ResourceID: "weapon-1",
		Action:     "modify",
	})
	if err != nil || !decision.Allowed {
		t.Errorf("item owner modify should be allowed: %v, allowed=%v", err, decision.Allowed)
	}

	decision, err = service.Authorize(charlieCtx, security.AuthorizationRequest{
		ResourceID: "weapon-1",
		Action:     "modify",
	})
	if err != nil {
		t.Fatalf("charlie weapon modify error: %v", err)
	}
	if !decision.Allowed {
		t.Errorf("players pass the hard rule; actor roles are enforced by the game: non-owner item modify")
	}

	decision, err = service.Authorize(playerCtx, security.AuthorizationRequest{
		ResourceID: "race-1",
		Action:     "modify",
	})
	if err != nil {
		t.Fatalf("player race modify error: %v", err)
	}
	if decision.Allowed {
		t.Errorf("non-admin race modify should be denied")
	}

	decision, err = service.Authorize(gmCtx, security.AuthorizationRequest{
		ResourceID: "race-1",
		Action:     "modify",
	})
	if err != nil || !decision.Allowed {
		t.Errorf("gm race modify should be allowed: %v, allowed=%v", err, decision.Allowed)
	}
}
