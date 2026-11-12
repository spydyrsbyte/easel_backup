package security

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var ErrDenied = errors.New("authorization denied")
var ErrNotFound = errors.New("security entity not found")

const typeResourcePrefix = "type:"

func typeResource(name string) string { return typeResourcePrefix + name }

type AuthorizationRequest struct {
	PrincipalID string
	ResourceID  string
	Action      string
	Context     map[string]any
}
type AuthorizationDecision struct {
	Allowed bool
	Reason  string
}
type policyResult struct {
	Module  string
	Granted bool
	Denied  bool
}

type SecurityService struct {
	Registry  *Registry
	Store     Store
	SessionID string
}

func (s *SecurityService) Authorize(ctx context.Context, r AuthorizationRequest) (AuthorizationDecision, error) {
	if s.Store == nil {
		return AuthorizationDecision{}, fmt.Errorf("security store is not configured")
	}
	tx, err := s.Store.Begin(ctx)
	if err != nil {
		return AuthorizationDecision{}, err
	}
	defer tx.Rollback(context.Background())
	return s.AuthorizeIn(ctx, tx, r)
}

func (s *SecurityService) AuthorizeIn(ctx context.Context, view View, r AuthorizationRequest) (AuthorizationDecision, error) {
	denied := AuthorizationDecision{Reason: "no applicable grant"}
	if s.Registry == nil || view == nil {
		return denied, fmt.Errorf("security registry and authoritative view are required")
	}
	if _, err := s.Registry.Fingerprint(); err != nil {
		return denied, err
	}
	id := Principal(ctx)
	trusted := Execution(ctx)
	if s.SessionID != "" && trusted.SessionID != s.SessionID {
		return AuthorizationDecision{Reason: "execution session does not match security service"}, nil
	}
	if scoped, ok := s.Store.(interface{ GameScope() string }); ok && trusted.GameID != scoped.GameScope() {
		return AuthorizationDecision{Reason: "execution game does not match security store"}, nil
	}
	if id == "" || (r.PrincipalID != "" && r.PrincipalID != id) {
		return AuthorizationDecision{Reason: "missing or mismatched trusted principal"}, nil
	}
	if r.ResourceID == "" || r.Action == "" {
		return denied, fmt.Errorf("resource and action are required")
	}
	principal, err := view.ResolvePrincipal(ctx, id)
	if errors.Is(err, ErrNotFound) {
		return AuthorizationDecision{Reason: "unknown principal"}, nil
	}
	if err != nil {
		return denied, err
	}
	var resource Entity
	if strings.HasPrefix(r.ResourceID, typeResourcePrefix) {
		typeName := strings.TrimPrefix(r.ResourceID, typeResourcePrefix)
		if err := s.Registry.knownType(typeName); err != nil {
			return denied, err
		}
		resource = Entity{ID: r.ResourceID, Type: typeName, Attributes: map[string]any{}}
	} else {
		resource, err = view.ResolveEntity(ctx, r.ResourceID)
	}
	if errors.Is(err, ErrNotFound) {
		return AuthorizationDecision{Reason: "unknown resource"}, nil
	}
	if err != nil {
		return denied, err
	}
	operation, err := normalizeOperation(r.Context)
	if err != nil {
		return denied, err
	}
	input := ruleInput{principal: principal, resource: resource, action: r.Action, execution: trusted, operation: operation}
	results := []policyResult{}
	granted := false
	for _, p := range s.Registry.matching(resource.Type, r.Action) {
		result := policyResult{Module: p.Owner}
		if p.Value.Allow != nil {
			result.Granted, err = matches(ctx, view, *p.Value.Allow, input)
			if err != nil {
				return denied, fmt.Errorf("module %s: %w", p.Owner, err)
			}
		}
		if p.Value.Deny != nil {
			result.Denied, err = matches(ctx, view, *p.Value.Deny, input)
			if err != nil {
				return denied, fmt.Errorf("module %s: %w", p.Owner, err)
			}
		}
		granted = granted || result.Granted
		results = append(results, result)
	}
	assignments, err := s.assignmentResults(ctx, view, principal, resource, r.Action)
	if err != nil {
		return denied, err
	}
	if err := ctx.Err(); err != nil {
		return denied, err
	}
	results = append(results, assignments...)
	for _, a := range assignments {
		granted = granted || a.Granted
	}
	if granted && denyOverrides(results) {
		return AuthorizationDecision{Allowed: true, Reason: "registered policy grant"}, nil
	}
	return denied, nil
}

func (s *SecurityService) RequireIn(ctx context.Context, view View, r AuthorizationRequest) error {
	d, err := s.AuthorizeIn(ctx, view, r)
	if err != nil {
		return err
	}
	return denial(d)
}

func (s *SecurityService) Require(ctx context.Context, r AuthorizationRequest) error {
	d, err := s.Authorize(ctx, r)
	if err != nil {
		return err
	}
	return denial(d)
}

func denial(d AuthorizationDecision) error {
	if d.Allowed {
		return nil
	}
	return fmt.Errorf("%w: %s", ErrDenied, d.Reason)
}

func (s *SecurityService) Protect(ctx context.Context, r AuthorizationRequest, operation func(Transaction) error) error {
	if s.Store == nil || operation == nil {
		return fmt.Errorf("security store and protected operation are required")
	}
	tx, err := s.Store.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if err := s.RequireIn(ctx, tx, r); err != nil {
		return err
	}
	if err := operation(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *SecurityService) ChangeRelationship(ctx context.Context, relationship Relationship, add bool) error {
	d, err := s.Registry.Relationship(relationship.Relation)
	if err != nil {
		return err
	}
	action := d.RemoveAction
	if add {
		action = d.AddAction
	}
	return s.Protect(ctx, AuthorizationRequest{ResourceID: relationship.ObjectID, Action: action, Context: map[string]any{"relationship": relationship, "add": add}}, func(tx Transaction) error {
		subject, err := tx.ResolvePrincipal(ctx, relationship.SubjectID)
		if err != nil {
			return err
		}
		object, err := tx.ResolveEntity(ctx, relationship.ObjectID)
		if err != nil {
			return err
		}
		if !s.Registry.isA(subject.Type, d.Subject) || !s.Registry.isA(object.Type, d.Object) {
			return fmt.Errorf("relationship %s entity type mismatch", relationship.Relation)
		}
		if add {
			return tx.AddRelationship(ctx, relationship)
		}
		return tx.RemoveRelationship(ctx, relationship)
	})
}

func denyOverrides(results []policyResult) bool {
	grant := false
	for _, r := range results {
		if r.Denied {
			return false
		}
		grant = grant || r.Granted
	}
	return grant
}
