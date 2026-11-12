package automation

import (
	"context"
	"fmt"

	"easel/internal/ident"
)

type Creator struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

const (
	CreatorSystem = "system"
	CreatorUser   = "user"
)

func (creator Creator) Validate() error {
	if (creator.Kind != CreatorSystem && creator.Kind != CreatorUser) || creator.ID == "" {
		return fmt.Errorf("creator requires system/user kind and an identity")
	}
	return nil
}

type Definition struct {
	Name       string   `json:"name"`
	Parameters []string `json:"parameters"`
	Event      string   `json:"event,omitempty"`
	Steps      []Step   `json:"steps"`
}

type Step struct {
	Op        string   `json:"op"`
	Name      string   `json:"name,omitempty"`
	Names     []string `json:"names,omitempty"`
	Type      string   `json:"type,omitempty"`
	ID        any      `json:"id,omitempty"`
	As        string   `json:"as,omitempty"`
	Target    any      `json:"target,omitempty"`
	Value     any      `json:"value,omitempty"`
	Record    string   `json:"record,omitempty"`
	Args      []any    `json:"args,omitempty"`
	Condition any      `json:"condition,omitempty"`
	Then      []Step   `json:"then,omitempty"`
	Else      []Step   `json:"else,omitempty"`
	Steps     []Step   `json:"steps,omitempty"`
	Item      string   `json:"item,omitempty"`
	Index     string   `json:"index,omitempty"`
	Message   string   `json:"message,omitempty"`
}

type Saved struct {
	Definition Definition `json:"definition"`
	Creator    Creator    `json:"creator"`
}

type Repository interface {
	Save(context.Context, Saved) error
	Load(context.Context, string) (Saved, error)
	List(context.Context) ([]Saved, error)
	Delete(context.Context, string) error
}

type WriteGuard interface {
	AuthorizesWrites() bool
}

type Access interface {
	Authorize(context.Context, string, Saved) error
}
type AllowAllStub struct{}

func (AllowAllStub) Authorize(context.Context, string, Saved) error { return nil }

type Record struct {
	Type    string
	ID      string
	Data    map[string]any
	Version int64
}

type Records interface {
	Begin(context.Context) (Transaction, error)
}
type Transaction interface {
	Load(context.Context, string, string) (Record, error)
	Save(context.Context, Record) error
	Create(context.Context, Record) (Record, error)
	Remove(context.Context, Record) error
	Commit(context.Context) error
	Rollback(context.Context) error
}

type Emission struct {
	Name    string
	Payload map[string]any
}
type Result struct {
	Value  any
	Events []Emission
}

func Validate(definition Definition) error {
	if !ident.Valid(definition.Name) {
		return fmt.Errorf("invalid automation name %q", definition.Name)
	}
	seen := map[string]bool{}
	for _, name := range definition.Parameters {
		if !ident.Valid(name) || seen[name] {
			return fmt.Errorf("invalid or duplicate parameter %q", name)
		}
		seen[name] = true
	}
	return validateSteps(definition.Steps, 0)
}

func validateSteps(steps []Step, depth int) error {
	if depth > maxNestingDepth {
		return fmt.Errorf("automation blocks are too deeply nested")
	}
	for index, step := range steps {
		switch step.Op {
		case "fields", "load", "let", "set", "delta", "multiply", "save", "compare", "block", "if", "each", "call", "emit", "return", "check", "append", "remove":
		default:
			return fmt.Errorf("step %d: unknown operation %q", index+1, step.Op)
		}
		switch step.Op {
		case "fields":
			if len(step.Names) == 0 {
				return fmt.Errorf("fields requires variable names")
			}
			for _, name := range step.Names {
				if !ident.Valid(name) {
					return fmt.Errorf("invalid variable %q", name)
				}
			}
		case "load":
			if step.Type == "" || step.ID == nil || !ident.Valid(step.As) {
				return fmt.Errorf("load requires type, ID and alias")
			}
		case "let":
			if !ident.Valid(step.Name) {
				return fmt.Errorf("let requires variable name")
			}
		case "set", "delta", "multiply", "append", "remove":
			if step.Target == nil {
				return fmt.Errorf("%s requires a target", step.Op)
			}
		case "save":
			if !ident.Valid(step.Record) {
				return fmt.Errorf("save requires a record alias")
			}
		case "call":
			if !ident.Valid(step.Name) || (step.As != "" && !ident.Valid(step.As)) {
				return fmt.Errorf("call requires automation name and valid result alias")
			}
		case "emit":
			if step.Name == "" {
				return fmt.Errorf("emit requires event name")
			}
		case "each":
			if !ident.Valid(step.Item) {
				return fmt.Errorf("each requires item variable")
			}
		case "if", "compare", "check":
			if step.Condition == nil {
				return fmt.Errorf("%s requires condition", step.Op)
			}
		}
		for _, nested := range [][]Step{step.Then, step.Else, step.Steps} {
			if err := validateSteps(nested, depth+1); err != nil {
				return err
			}
		}
	}
	return nil
}

type transactionKey struct{}

func WithTransaction(ctx context.Context, tx Transaction) context.Context {
	return context.WithValue(ctx, transactionKey{}, tx)
}

func SharedTransaction(ctx context.Context) Transaction {
	tx, _ := ctx.Value(transactionKey{}).(Transaction)
	return tx
}
