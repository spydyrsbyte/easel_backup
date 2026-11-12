package security

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
)

type memoryStore struct {
	sync.Mutex
	entities      map[string]Entity
	principals    map[string]bool
	relationships map[Relationship]bool
	fingerprint   string
	build         string
	assignments   map[Assignment]bool
}
type memoryTx struct {
	s           *memoryStore
	closed      bool
	pending     map[Relationship]bool
	assignments map[Assignment]bool
}

func newMemory() *memoryStore {
	return &memoryStore{entities: map[string]Entity{
		"alice":  {ID: "alice", Type: "easel.easel.User", Attributes: map[string]any{}},
		"bob":    {ID: "bob", Type: "easel.easel.User", Attributes: map[string]any{}},
		"group":  {ID: "group", Type: "module.Group", Attributes: map[string]any{}},
		"record": {ID: "record", Type: "Character", Attributes: map[string]any{"locked": false}},
	}, principals: map[string]bool{"alice": true, "bob": true, "group": true}, relationships: map[Relationship]bool{}, assignments: map[Assignment]bool{}}
}
func (s *memoryStore) Begin(context.Context) (Transaction, error) {
	s.Lock()
	pending := map[Relationship]bool{}
	for r, v := range s.relationships {
		pending[r] = v
	}
	assignments := map[Assignment]bool{}
	for a, v := range s.assignments {
		assignments[a] = v
	}
	return &memoryTx{s: s, pending: pending, assignments: assignments}, nil
}
func (s *memoryStore) CheckRegistry(_ context.Context, build, fingerprint string) error {
	if build == "" || fingerprint == "" {
		return fmt.Errorf("build and registry fingerprint are required")
	}
	s.Lock()
	defer s.Unlock()
	if s.fingerprint == "" {
		s.fingerprint = fingerprint
	}
	if s.fingerprint != fingerprint {
		return fmt.Errorf("incompatible security registry for build %s: game is registered by build %s", build, s.build)
	}
	s.build = build
	return nil
}
func (t *memoryTx) ResolvePrincipal(ctx context.Context, id string) (Entity, error) {
	if !t.s.principals[id] {
		return Entity{}, ErrNotFound
	}
	return t.ResolveEntity(ctx, id)
}
func (t *memoryTx) ResolveEntity(_ context.Context, id string) (Entity, error) {
	e, ok := t.s.entities[id]
	if !ok {
		return e, ErrNotFound
	}
	return e, nil
}
func (t *memoryTx) HasRelationship(_ context.Context, s, r, o string) (bool, error) {
	return t.pending[Relationship{s, r, o}], nil
}
func (t *memoryTx) QueryRelationships(_ context.Context, s, r string) ([]Relationship, error) {
	result := []Relationship{}
	for row, active := range t.pending {
		if active && row.SubjectID == s && row.Relation == r {
			result = append(result, row)
		}
	}
	return result, nil
}
func (t *memoryTx) AddRelationship(_ context.Context, r Relationship) error {
	t.pending[r] = true
	return nil
}
func (t *memoryTx) RemoveRelationship(_ context.Context, r Relationship) error {
	delete(t.pending, r)
	return nil
}
func (t *memoryTx) Commit(context.Context) error {
	if t.closed {
		return fmt.Errorf("closed transaction")
	}
	t.s.relationships = t.pending
	t.s.assignments = t.assignments
	t.closed = true
	t.s.Unlock()
	return nil
}
func (t *memoryTx) Rollback(context.Context) error {
	if !t.closed {
		t.closed = true
		t.s.Unlock()
	}
	return nil
}

func (t *memoryTx) QueryAssignments(_ context.Context, ids []string, resource string) ([]Assignment, error) {
	set := map[string]bool{}
	for _, id := range ids {
		set[id] = true
	}
	out := []Assignment{}
	for a, active := range t.assignments {
		if active && set[a.PrincipalID] && (a.ResourceID == "" || a.ResourceID == resource) {
			out = append(out, a)
		}
	}
	return out, nil
}
func (t *memoryTx) SetAssignment(_ context.Context, a Assignment) error {
	for previous := range t.assignments {
		if previous.PrincipalID == a.PrincipalID && previous.Permission == a.Permission && previous.ResourceID == a.ResourceID {
			delete(t.assignments, previous)
		}
	}
	t.assignments[a] = true
	return nil
}
func (t *memoryTx) RemoveAssignment(_ context.Context, a Assignment) error {
	for previous := range t.assignments {
		if previous.PrincipalID == a.PrincipalID && previous.Permission == a.Permission && previous.ResourceID == a.ResourceID {
			delete(t.assignments, previous)
		}
	}
	return nil
}
func (t *memoryTx) CreateGroup(_ context.Context, e Entity) error {
	if _, ok := t.s.entities[e.ID]; ok {
		return fmt.Errorf("duplicate principal")
	}
	t.s.entities[e.ID] = e
	t.s.principals[e.ID] = true
	return nil
}
func (t *memoryTx) DeleteGroup(_ context.Context, id string) error {
	for a := range t.assignments {
		if a.ResourceID == id {
			delete(t.assignments, a)
		}
	}
	delete(t.s.entities, id)
	delete(t.s.principals, id)
	return nil
}

func testContract() *BuildContract {
	return &BuildContract{
		Types: map[string]bool{"Character": true},
	}
}
func testService(t *testing.T, policies map[string]Policy) (*SecurityService, *memoryStore) {
	t.Helper()
	r := initializedRegistry(t, func(r *Registry) error {
		for _, action := range []string{"modify", "grant", "revoke"} {
			if err := r.RegisterAction("app", "Character", action); err != nil {
				return err
			}
		}
		if err := r.RegisterRelationship("app", "control", RelationshipDefinition{Subject: "easel.easel.User", Object: "Character", AddAction: "grant", RemoveAction: "revoke"}); err != nil {
			return err
		}
		for name, p := range policies {
			if err := r.RegisterPolicy("app", name, p); err != nil {
				return err
			}
		}
		return nil
	})
	store := newMemory()
	return &SecurityService{Registry: r, Store: store}, store
}

func initializedRegistry(t *testing.T, register func(*Registry) error) *Registry {
	t.Helper()
	r := NewRegistry(testContract())
	if err := r.Initialize(func() error { return register(r) }); err != nil {
		t.Fatal(err)
	}
	return r
}

func modify(rule Rule) Policy {
	return Policy{Action: "modify", Resource: "Character", Allow: &rule}
}

func equals(field string, value any) Rule {
	data, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return Rule{Field: field, Equals: data}
}

var (
	always  = Rule{Always: true}
	isAlice = equals("principal.id", "alice")
	isBob   = equals("principal.id", "bob")
	control = Rule{All: []Rule{{Relationship: "control"}, equals("resource.attributes.locked", false)}}
)

func decision(t *testing.T, s *SecurityService, principal string) bool {
	t.Helper()
	d, err := s.Authorize(WithPrincipal(context.Background(), principal), AuthorizationRequest{ResourceID: "record", Action: "modify"})
	if err != nil {
		t.Fatal(err)
	}
	return d.Allowed
}

func TestRegistryLifecycle(t *testing.T) {
	r := NewRegistry(testContract())
	if err := r.RegisterRelationship("app", "control", RelationshipDefinition{Subject: "easel.easel.User", Object: "Character"}); err == nil {
		t.Fatal("early registration accepted")
	}
	err := r.Initialize(func() error {
		for _, action := range []string{"modify", "grant", "revoke"} {
			if err := r.RegisterAction("app", "Character", action); err != nil {
				return err
			}
		}
		if err := r.RegisterRelationship("app", "control", RelationshipDefinition{Subject: "easel.easel.User", Object: "Character", AddAction: "grant", RemoveAction: "revoke"}); err != nil {
			return err
		}
		if err := r.RegisterPolicy("app", "first", modify(always)); err != nil {
			return err
		}
		if err := r.RegisterPolicy("other", "second", modify(Rule{Not: &always})); err != nil {
			return err
		}
		if err := r.RegisterRelationship("app", "control", RelationshipDefinition{Subject: "Group", Object: "Character"}); err == nil {
			t.Fatal("duplicate accepted")
		}
		if err := r.RegisterRelationship("another-module", "another", RelationshipDefinition{Subject: "easel.easel.User", Object: "Character", AddAction: "grant", RemoveAction: "revoke"}); err != nil {
			t.Fatal("participating module rejected", err)
		}
		if err := r.RegisterPolicy("app", "invalid", modify(Rule{})); err == nil {
			t.Fatal("invalid policy accepted")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.Fingerprint(); err != nil {
		t.Fatal(err)
	}
	d, _ := r.Relationship("control")
	d.Object = "Changed"
	again, _ := r.Relationship("control")
	if again.Object != "Character" {
		t.Fatal("definition mutated")
	}
	if err := r.RegisterPolicy("app", "late", modify(always)); err == nil {
		t.Fatal("late registration accepted")
	}
	if err := r.Initialize(func() error { return nil }); err == nil {
		t.Fatal("registry reopened")
	}
}

func TestRelationshipRevocationAndAttributes(t *testing.T) {
	s, store := testService(t, map[string]Policy{"modify": modify(control), "grant": {Action: "grant", Resource: "Character", Allow: &isAlice}, "revoke": {Action: "revoke", Resource: "Character", Allow: &isAlice}})
	if decision(t, s, "alice") {
		t.Fatal("missing relation granted")
	}
	relation := Relationship{"bob", "control", "record"}
	if err := s.ChangeRelationship(WithPrincipal(context.Background(), "bob"), relation, true); !errors.Is(err, ErrDenied) {
		t.Fatalf("self grant: %v", err)
	}
	alice := WithPrincipal(context.Background(), "alice")
	if err := s.ChangeRelationship(alice, relation, true); err != nil {
		t.Fatal(err)
	}
	if !decision(t, s, "bob") {
		t.Fatal("new relation not visible")
	}
	store.entities["record"].Attributes["locked"] = true
	if decision(t, s, "bob") {
		t.Fatal("locked resource granted")
	}
	delete(store.entities["record"].Attributes, "locked")
	if decision(t, s, "bob") {
		t.Fatal("missing attribute granted")
	}
	store.entities["record"].Attributes["locked"] = false
	if err := s.ChangeRelationship(alice, relation, false); err != nil {
		t.Fatal(err)
	}
	if decision(t, s, "bob") {
		t.Fatal("revoked grant cached")
	}
	if _, err := s.Registry.Relationship("control"); err != nil {
		t.Fatal(err)
	}
}

func TestRuleValidation(t *testing.T) {
	deep := always
	for range maxRuleDepth + 1 {
		nested := deep
		deep = Rule{Not: &nested}
	}
	for name, test := range map[string]struct {
		rule Rule
		want string
	}{
		"empty":                {Rule{}, "exactly one"},
		"two conditions":       {Rule{Always: true, Relationship: "control"}, "exactly one"},
		"unknown root":         {Rule{Field: "request.id", Equals: json.RawMessage(`1`)}, "invalid field"},
		"bare attributes":      {Rule{Field: "resource.attributes", Equals: json.RawMessage(`1`)}, "invalid field"},
		"missing comparison":   {Rule{Field: "principal.id"}, "exactly one of equals or equalsField"},
		"both comparisons":     {Rule{Field: "principal.id", Equals: json.RawMessage(`"a"`), EqualsField: "resource.id"}, "exactly one of equals or equalsField"},
		"invalid literal":      {Rule{Field: "principal.id", Equals: json.RawMessage(`{`)}, "invalid equals value"},
		"orphan equals":        {Rule{Always: true, Equals: json.RawMessage(`1`)}, "require field"},
		"long path":            {Rule{Path: make([]string, maxRelationshipPathSteps+1)}, "relationship path"},
		"too deep":             {deep, "nesting"},
		"unknown relationship": {Rule{Relationship: "missing"}, "unregistered relationship missing"},
	} {
		t.Run(name, func(t *testing.T) {
			r := NewRegistry(testContract())
			err := r.Initialize(func() error {
				if err := r.RegisterAction("app", "Character", "modify"); err != nil {
					return err
				}
				return r.RegisterPolicy("app", "p", modify(test.rule))
			})
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

func TestRuleEvaluation(t *testing.T) {
	store := newMemory()
	store.relationships[Relationship{"alice", "control", "record"}] = true
	store.relationships[Relationship{"alice", "member", "group"}] = true
	store.relationships[Relationship{"group", "control", "record"}] = true
	tx, _ := store.Begin(context.Background())
	defer tx.Rollback(context.Background())
	input := ruleInput{
		principal: store.entities["alice"],
		resource:  store.entities["record"],
		action:    "modify",
		execution: ExecutionContext{GameID: "game", Attributes: map[string]any{"zone": map[string]any{"name": "north"}}},
		operation: map[string]any{"add": true},
	}
	for name, test := range map[string]struct {
		rule Rule
		want bool
	}{
		"always":              {always, true},
		"relationship":        {Rule{Relationship: "control"}, true},
		"missing link":        {Rule{Relationship: "member"}, false},
		"not":                 {Rule{Not: &Rule{Relationship: "control"}}, false},
		"path":                {Rule{Path: []string{"member", "control"}}, true},
		"any":                 {Rule{Any: []Rule{isBob, isAlice}}, true},
		"all":                 {Rule{All: []Rule{{Relationship: "control"}, equals("resource.attributes.locked", true)}}, false},
		"action":              {equals("action", "modify"), true},
		"type":                {equals("resource.type", "Character"), true},
		"nested attribute":    {equals("context.attributes.zone.name", "north"), true},
		"operation":           {equals("context.operation.add", true), true},
		"missing is null":     {equals("resource.attributes.missing", nil), true},
		"field to same field": {Rule{Field: "principal.id", EqualsField: "principal.id"}, true},
		"field to field":      {Rule{Field: "principal.id", EqualsField: "resource.id"}, false},
	} {
		t.Run(name, func(t *testing.T) {
			if err := validateRule(test.rule, 0); err != nil {
				t.Fatal(err)
			}
			got, err := matches(context.Background(), tx, test.rule, input)
			if err != nil || got != test.want {
				t.Fatalf("got %v %v, want %v", got, err, test.want)
			}
		})
	}
}

func TestPolicyCombination(t *testing.T) {
	s, _ := testService(t, map[string]Policy{"grant": modify(always), "deny": {Action: "modify", Resource: "Character", Deny: &always}})
	if decision(t, s, "alice") {
		t.Fatal("deny did not override grant")
	}
	s, _ = testService(t, nil)
	if decision(t, s, "alice") {
		t.Fatal("no policies granted")
	}
}

func TestTrustedIdentityAndAtomicOperation(t *testing.T) {
	s, store := testService(t, map[string]Policy{"allow": modify(isAlice)})
	req := AuthorizationRequest{PrincipalID: "alice", ResourceID: "record", Action: "modify"}
	d, err := s.Authorize(WithPrincipal(context.Background(), "bob"), req)
	if err != nil || d.Allowed {
		t.Fatal("impersonation accepted")
	}
	d, err = s.Authorize(context.Background(), req)
	if err != nil || d.Allowed {
		t.Fatal("anonymous accepted")
	}
	req.PrincipalID = ""
	changed := false
	if err := s.Protect(WithPrincipal(context.Background(), "bob"), req, func(Transaction) error { changed = true; return nil }); !errors.Is(err, ErrDenied) || changed {
		t.Fatal("unauthorized callback ran")
	}
	abort := errors.New("abort")
	relation := Relationship{"alice", "control", "record"}
	if err := s.Protect(WithPrincipal(context.Background(), "alice"), req, func(tx Transaction) error {
		if err := tx.AddRelationship(context.Background(), relation); err != nil {
			return err
		}
		return abort
	}); !errors.Is(err, abort) {
		t.Fatal(err)
	}
	if store.relationships[relation] {
		t.Fatal("failed operation committed")
	}
}

func TestExplicitCyclicPath(t *testing.T) {
	store := newMemory()
	store.relationships[Relationship{"alice", "member", "group"}] = true
	store.relationships[Relationship{"group", "member", "alice"}] = true
	store.relationships[Relationship{"group", "control", "record"}] = true
	tx, _ := store.Begin(context.Background())
	defer tx.Rollback(context.Background())
	ok, err := HasPath(context.Background(), tx, "alice", []string{"member", "control"}, "record")
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	ok, err = HasPath(context.Background(), tx, "alice", []string{"member", "member", "member", "control"}, "record")
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	if _, err := HasPath(context.Background(), tx, "alice", make([]string, 33), "record"); err == nil {
		t.Fatal("unbounded path accepted")
	}
}

func TestRegistryCompatibility(t *testing.T) {
	a, store := testService(t, map[string]Policy{"p": modify(control)})
	b, _ := testService(t, map[string]Policy{"p": modify(control)})
	c, _ := testService(t, map[string]Policy{"p": modify(always)})
	fa, _ := a.Registry.Fingerprint()
	fb, _ := b.Registry.Fingerprint()
	fc, _ := c.Registry.Fingerprint()
	if fa != fb || fa == fc {
		t.Fatal("incorrect fingerprints")
	}
	if err := store.CheckRegistry(context.Background(), "build", fa); err != nil {
		t.Fatal(err)
	}
	if err := store.CheckRegistry(context.Background(), "build", fb); err != nil {
		t.Fatal(err)
	}
	if err := store.CheckRegistry(context.Background(), "build", fc); err == nil {
		t.Fatal("incompatible build accepted")
	}

	b.Store = store
	store.relationships[Relationship{"alice", "control", "record"}] = true
	if !decision(t, a, "alice") || !decision(t, b, "alice") {
		t.Fatal("shared relationship invisible")
	}
	delete(store.relationships, Relationship{"alice", "control", "record"})
	if decision(t, a, "alice") || decision(t, b, "alice") {
		t.Fatal("revocation invisible")
	}
}

func TestUnknownEntitiesAreDenied(t *testing.T) {
	s, _ := testService(t, map[string]Policy{"p": modify(always)})
	for name, test := range map[string]struct {
		principal string
		resource  string
		reason    string
	}{
		"principal": {"nobody", "record", "unknown principal"},
		"resource":  {"alice", "missing", "unknown resource"},
	} {
		t.Run(name, func(t *testing.T) {
			d, err := s.Authorize(WithPrincipal(context.Background(), test.principal), AuthorizationRequest{ResourceID: test.resource, Action: "modify"})
			if err != nil || d.Allowed || d.Reason != test.reason {
				t.Fatalf("got %+v %v", d, err)
			}
		})
	}
}

func TestRegistryNamesRegisteredBuild(t *testing.T) {
	store := newMemory()
	if err := store.CheckRegistry(context.Background(), "first", strings.Repeat("a", 64)); err != nil {
		t.Fatal(err)
	}
	if err := store.CheckRegistry(context.Background(), "second", strings.Repeat("b", 64)); err == nil || !strings.Contains(err.Error(), "registered by build first") {
		t.Fatalf("got %v", err)
	}
}

func TestRegistryTypes(t *testing.T) {
	for name, test := range map[string]struct {
		register func(r *Registry) error
		want     string
	}{
		"unknown type": {func(r *Registry) error {
			return r.RegisterRelationship("app", "bad", RelationshipDefinition{Subject: UserType, Object: "Missing", AddAction: "grant", RemoveAction: "grant"})
		}, `unregistered type "Missing"`},
		"foreign group host": {func(r *Registry) error {
			return r.RegisterGroup("easel.acme.game", "easel.other.Party", GroupDefinition{CreateAction: "create", DeleteAction: "delete"})
		}, "must be a JavaScript identifier in host easel.acme"},
		"group shadows user": {func(r *Registry) error {
			return r.RegisterGroup("easel.easel.mod", "User", GroupDefinition{})
		}, "conflicts with an existing type"},
	} {
		t.Run(name, func(t *testing.T) {
			r := NewRegistry(testContract())
			if err := r.Initialize(func() error { return test.register(r) }); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	r := NewRegistry(testContract())
	err := r.Initialize(func() error {
		for _, action := range []string{"join", "create", "delete"} {
			if err := r.RegisterAction("easel.acme.game", "easel.acme.Party", action); err != nil {
				return err
			}
		}
		if err := r.RegisterRelationship("easel.acme.game", "member", RelationshipDefinition{Subject: UserType, Object: "easel.acme.Party", AddAction: "join", RemoveAction: "join", Membership: true}); err != nil {
			return err
		}
		return r.RegisterGroup("easel.acme.game", "Party", GroupDefinition{CreateAction: "create", DeleteAction: "delete"})
	})
	if err != nil {
		t.Fatalf("group registered after its first use: %v", err)
	}
}

func TestGroupCannotShadowRecordType(t *testing.T) {
	r := NewRegistry(&BuildContract{Types: map[string]bool{"easel.acme.Character": true}})
	err := r.Initialize(func() error {
		return r.RegisterGroup("easel.acme.game", "Character", GroupDefinition{CreateAction: "create", DeleteAction: "delete"})
	})
	if err == nil || !strings.Contains(err.Error(), "group type easel.acme.Character conflicts with an existing type") {
		t.Fatalf("got %v", err)
	}
}
