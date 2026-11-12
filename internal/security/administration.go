package security

import (
	"context"
	"errors"
	"fmt"
	"sort"
)

const (
	EffectAllow = "allow"
	EffectDeny  = "deny"
)

type Assignment struct {
	PrincipalID string `json:"principal"`
	Permission  string `json:"permission"`

	ResourceID string `json:"resource,omitempty"`
	Effect     string `json:"effect"`
}

func (s *SecurityService) subjects(ctx context.Context, view View, principal Entity) ([]string, error) {
	seen := map[string]bool{principal.ID: true}
	queue := []Entity{principal}
	steps := 0
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for name, d := range s.Registry.relationships {
			if !d.Value.Membership || d.Value.Subject != current.Type {
				continue
			}
			rows, err := view.QueryRelationships(ctx, current.ID, name)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				steps++
				if steps > maxTraversalRows {
					return nil, fmt.Errorf("group membership traversal budget exceeded")
				}
				if seen[row.ObjectID] {
					continue
				}
				group, err := view.ResolvePrincipal(ctx, row.ObjectID)
				if err != nil {
					return nil, err
				}
				if group.Type != d.Value.Object {
					return nil, fmt.Errorf("invalid group membership entity type")
				}
				seen[group.ID] = true
				queue = append(queue, group)
			}
		}
	}
	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids, nil
}

func (s *SecurityService) assignmentResults(ctx context.Context, view View, principal, resource Entity, action string) ([]policyResult, error) {
	ids, err := s.subjects(ctx, view, principal)
	if err != nil {
		return nil, err
	}
	id := resource.ID
	if resource.ID == typeResource(resource.Type) {
		id = ""
	}
	assignments, err := view.QueryAssignments(ctx, ids, id)
	if err != nil {
		return nil, err
	}
	results := []policyResult{}
	for _, a := range assignments {
		p, ok := s.Registry.permissions[a.Permission]
		if !ok || !p.Value.Configurable || p.Value.Resource != resource.Type || p.Value.Action != action {
			continue
		}
		if a.ResourceID == "" && !p.Value.TypeScope || a.ResourceID != "" && (!p.Value.InstanceScope || a.ResourceID != id) {
			continue
		}
		if a.Effect != EffectAllow && a.Effect != EffectDeny {
			return nil, fmt.Errorf("invalid persisted permission effect")
		}
		results = append(results, policyResult{Module: p.Owner, Granted: a.Effect == EffectAllow, Denied: a.Effect == EffectDeny})
	}
	return results, nil
}

func (s *SecurityService) ChangeAssignment(ctx context.Context, a Assignment, remove bool) error {
	if _, err := s.Registry.Fingerprint(); err != nil {
		return err
	}
	p, ok := s.Registry.permissions[a.Permission]
	if !ok || !p.Value.Configurable {
		return fmt.Errorf("permission is not administratively configurable")
	}
	if a.Effect != EffectAllow && a.Effect != EffectDeny {
		return fmt.Errorf("assignment effect must be allow or deny")
	}
	if a.ResourceID == "" && !p.Value.TypeScope || a.ResourceID != "" && !p.Value.InstanceScope {
		return fmt.Errorf("permission scope is not configurable")
	}
	target := a.ResourceID
	if target == "" {
		target = typeResource(p.Value.Resource)
	}
	request := AuthorizationRequest{ResourceID: target, Action: p.Value.ManageAction, Context: map[string]any{"assignment": a, "remove": remove}}
	return s.Protect(ctx, request, func(tx Transaction) error {
		if _, err := tx.ResolvePrincipal(ctx, a.PrincipalID); err != nil {
			return err
		}
		if a.ResourceID != "" {
			resource, err := tx.ResolveEntity(ctx, a.ResourceID)
			if err != nil {
				return err
			}
			if resource.Type != p.Value.Resource {
				return fmt.Errorf("permission resource type mismatch")
			}
		}
		if remove {
			return tx.RemoveAssignment(ctx, a)
		}
		return tx.SetAssignment(ctx, a)
	})
}

func (s *SecurityService) CreateGroup(ctx context.Context, e Entity) error {
	if _, err := s.Registry.Fingerprint(); err != nil {
		return err
	}
	d, ok := s.Registry.groups[e.Type]
	if !ok {
		return fmt.Errorf("unregistered group type")
	}
	if e.ID == "" {
		return fmt.Errorf("group ID is required")
	}
	return s.Protect(ctx, AuthorizationRequest{ResourceID: typeResource(e.Type), Action: d.Value.CreateAction, Context: map[string]any{"group": e}}, func(tx Transaction) error {
		if _, err := tx.ResolveEntity(ctx, e.ID); err == nil {
			return fmt.Errorf("group ID already identifies an entity")
		} else if !errors.Is(err, ErrNotFound) {
			return err
		}
		return tx.CreateGroup(ctx, e)
	})
}

func (s *SecurityService) DeleteGroup(ctx context.Context, id string) error {
	tx, err := s.Store.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	group, err := tx.ResolvePrincipal(ctx, id)
	if err != nil {
		return err
	}
	d, ok := s.Registry.groups[group.Type]
	if !ok {
		return fmt.Errorf("principal is not a registered group")
	}
	if err := s.RequireIn(ctx, tx, AuthorizationRequest{ResourceID: id, Action: d.Value.DeleteAction}); err != nil {
		return err
	}
	if err := tx.DeleteGroup(ctx, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
