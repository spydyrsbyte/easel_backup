package security

import (
	"context"
	"fmt"
)

type Entity struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Attributes map[string]any `json:"attributes"`
}

type Relationship struct {
	SubjectID string `json:"subject"`
	Relation  string `json:"relation"`
	ObjectID  string `json:"object"`
}

type View interface {
	ResolvePrincipal(context.Context, string) (Entity, error)
	ResolveEntity(context.Context, string) (Entity, error)
	HasRelationship(context.Context, string, string, string) (bool, error)
	QueryRelationships(context.Context, string, string) ([]Relationship, error)
	QueryAssignments(context.Context, []string, string) ([]Assignment, error)
}

type Transaction interface {
	View
	AddRelationship(context.Context, Relationship) error
	RemoveRelationship(context.Context, Relationship) error
	SetAssignment(context.Context, Assignment) error
	RemoveAssignment(context.Context, Assignment) error
	CreateGroup(context.Context, Entity) error
	DeleteGroup(context.Context, string) error
	Commit(context.Context) error
	Rollback(context.Context) error
}

type Store interface {
	Begin(context.Context) (Transaction, error)
	CheckRegistry(context.Context, string, string) error
}

func HasPath(ctx context.Context, view View, subject string, path []string, object string) (bool, error) {
	if len(path) == 0 || len(path) > maxRelationshipPathSteps {
		return false, fmt.Errorf("relationship path requires 1..%d steps", maxRelationshipPathSteps)
	}
	frontier := map[string]bool{subject: true}
	visited := 0
	for _, relation := range path {
		next := map[string]bool{}
		for id := range frontier {
			if err := ctx.Err(); err != nil {
				return false, err
			}
			rows, err := view.QueryRelationships(ctx, id, relation)
			if err != nil {
				return false, err
			}
			for _, row := range rows {
				visited++
				if visited > maxTraversalRows {
					return false, fmt.Errorf("relationship traversal budget exceeded")
				}
				next[row.ObjectID] = true
			}
		}
		frontier = next
	}
	return frontier[object], nil
}
