package schema

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

type EventTypes struct {
	Schema *Schema
	Lookup func(context.Context, string) (string, error)
}

func (types EventTypes) Resolve(typeName string) error {
	target, reference := strings.CutPrefix(typeName, "*")
	if !reference {
		return fmt.Errorf("event field type %q must be a builtin or a record reference such as *host.name", typeName)
	}
	_, err := types.Schema.Type(target)
	return err
}

func (types EventTypes) Validate(ctx context.Context, typeName string, value json.RawMessage) error {
	target := strings.TrimPrefix(typeName, "*")
	var id string
	if err := json.Unmarshal(value, &id); err != nil || id == "" {
		return fmt.Errorf("expected the ID of a %s record", target)
	}
	if types.Lookup == nil {
		return nil
	}
	actual, err := types.Lookup(ctx, id)
	if err != nil {
		return err
	}
	if !types.Schema.IsA(actual, target) {
		return fmt.Errorf("record %s is a %s, not a %s", id, actual, target)
	}
	return nil
}
