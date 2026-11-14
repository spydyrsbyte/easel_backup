package session

import (
	"context"

	"easel/internal/security"
)

type memorySecurityStore struct {
	relationships map[security.Relationship]bool
}

func (s *memorySecurityStore) Begin(context.Context) (security.Transaction, error) { return s, nil }
func (s *memorySecurityStore) CheckRegistry(context.Context, string, string) error { return nil }
func (s *memorySecurityStore) ResolvePrincipal(_ context.Context, id string) (security.Entity, error) {
	return security.Entity{ID: id, Type: "easel.easel.User", Attributes: map[string]any{"role": "player"}}, nil
}
func (s *memorySecurityStore) ResolveEntity(_ context.Context, id string) (security.Entity, error) {
	return security.Entity{ID: id, Type: "easel.vtt.Actor", Attributes: map[string]any{}}, nil
}
func (s *memorySecurityStore) HasRelationship(_ context.Context, a, b, c string) (bool, error) {
	return s.relationships[security.Relationship{SubjectID: a, Relation: b, ObjectID: c}], nil
}
func (s *memorySecurityStore) QueryRelationships(_ context.Context, a, b string) ([]security.Relationship, error) {
	out := []security.Relationship{}
	for r := range s.relationships {
		if r.SubjectID == a && r.Relation == b {
			out = append(out, r)
		}
	}
	return out, nil
}
func (s *memorySecurityStore) AddRelationship(_ context.Context, r security.Relationship) error {
	s.relationships[r] = true
	return nil
}
func (s *memorySecurityStore) RemoveRelationship(_ context.Context, r security.Relationship) error {
	delete(s.relationships, r)
	return nil
}
func (s *memorySecurityStore) Commit(context.Context) error   { return nil }
func (s *memorySecurityStore) Rollback(context.Context) error { return nil }
func (s *memorySecurityStore) QueryAssignments(context.Context, []string, string) ([]security.Assignment, error) {
	return nil, nil
}
func (s *memorySecurityStore) SetAssignment(context.Context, security.Assignment) error    { return nil }
func (s *memorySecurityStore) RemoveAssignment(context.Context, security.Assignment) error { return nil }
func (s *memorySecurityStore) CreateGroup(context.Context, security.Entity) error          { return nil }
func (s *memorySecurityStore) DeleteGroup(context.Context, string) error                   { return nil }
