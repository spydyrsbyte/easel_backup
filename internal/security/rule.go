package security

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

type Rule struct {
	Always       bool            `json:"always,omitempty"`
	All          []Rule          `json:"all,omitempty"`
	Any          []Rule          `json:"any,omitempty"`
	Not          *Rule           `json:"not,omitempty"`
	Relationship string          `json:"relationship,omitempty"`
	Path         []string        `json:"path,omitempty"`
	Field        string          `json:"field,omitempty"`
	Equals       json.RawMessage `json:"equals,omitempty"`
	EqualsField  string          `json:"equalsField,omitempty"`
}

type ruleInput struct {
	principal Entity
	resource  Entity
	action    string
	execution ExecutionContext
	operation map[string]any
}

func validateRule(rule Rule, depth int) error {
	if depth > maxRuleDepth {
		return fmt.Errorf("rule nesting exceeds %d levels", maxRuleDepth)
	}
	kinds := 0
	for _, set := range []bool{rule.Always, len(rule.All) > 0, len(rule.Any) > 0, rule.Not != nil, rule.Relationship != "", len(rule.Path) > 0, rule.Field != ""} {
		if set {
			kinds++
		}
	}
	if kinds != 1 {
		return fmt.Errorf("rule must have exactly one of always, all, any, not, relationship, path, or field")
	}
	switch {
	case len(rule.All) > 0 || len(rule.Any) > 0:
		for _, nested := range append(append([]Rule(nil), rule.All...), rule.Any...) {
			if err := validateRule(nested, depth+1); err != nil {
				return err
			}
		}
	case rule.Not != nil:
		if err := validateRule(*rule.Not, depth+1); err != nil {
			return err
		}
	case len(rule.Path) > maxRelationshipPathSteps:
		return fmt.Errorf("relationship path requires 1..%d steps", maxRelationshipPathSteps)
	case rule.Field != "":
		if err := validateField(rule.Field); err != nil {
			return err
		}
		if (rule.Equals == nil) == (rule.EqualsField == "") {
			return fmt.Errorf("field %s requires exactly one of equals or equalsField", rule.Field)
		}
		if rule.EqualsField != "" {
			if err := validateField(rule.EqualsField); err != nil {
				return err
			}
		} else {
			var literal any
			if err := json.Unmarshal(rule.Equals, &literal); err != nil {
				return fmt.Errorf("field %s: invalid equals value: %w", rule.Field, err)
			}
		}
	}
	if rule.Equals != nil && rule.Field == "" || rule.EqualsField != "" && rule.Field == "" {
		return fmt.Errorf("equals and equalsField require field")
	}
	return nil
}

func validateField(path string) error {
	parts := strings.Split(path, ".")
	for _, part := range parts {
		if part == "" {
			return fmt.Errorf("invalid field %q", path)
		}
	}
	valid := false
	switch parts[0] {
	case "action":
		valid = len(parts) == 1
	case "principal", "resource":
		valid = len(parts) == 2 && (parts[1] == "id" || parts[1] == "type") || len(parts) > 2 && parts[1] == "attributes"
	case "context":
		valid = len(parts) == 2 && (parts[1] == "game" || parts[1] == "session" || parts[1] == "origin") || len(parts) > 2 && (parts[1] == "attributes" || parts[1] == "operation")
	}
	if !valid {
		return fmt.Errorf("invalid field %q", path)
	}
	return nil
}

func ruleRelationships(rule Rule) []string {
	names := []string{}
	if rule.Relationship != "" {
		names = append(names, rule.Relationship)
	}
	names = append(names, rule.Path...)
	for _, nested := range append(append([]Rule(nil), rule.All...), rule.Any...) {
		names = append(names, ruleRelationships(nested)...)
	}
	if rule.Not != nil {
		names = append(names, ruleRelationships(*rule.Not)...)
	}
	return names
}

func matches(ctx context.Context, view View, rule Rule, input ruleInput) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	switch {
	case rule.Always:
		return true, nil
	case len(rule.All) > 0:
		for _, nested := range rule.All {
			ok, err := matches(ctx, view, nested, input)
			if err != nil || !ok {
				return false, err
			}
		}
		return true, nil
	case len(rule.Any) > 0:
		for _, nested := range rule.Any {
			ok, err := matches(ctx, view, nested, input)
			if err != nil || ok {
				return ok, err
			}
		}
		return false, nil
	case rule.Not != nil:
		ok, err := matches(ctx, view, *rule.Not, input)
		if err != nil {
			return false, err
		}
		return !ok, nil
	case rule.Relationship != "":
		return view.HasRelationship(ctx, input.principal.ID, rule.Relationship, input.resource.ID)
	case len(rule.Path) > 0:
		return HasPath(ctx, view, input.principal.ID, rule.Path, input.resource.ID)
	case rule.Field != "":
		var expected any
		if rule.EqualsField != "" {
			expected = input.field(rule.EqualsField)
		} else if err := json.Unmarshal(rule.Equals, &expected); err != nil {
			return false, fmt.Errorf("field %s: invalid equals value: %w", rule.Field, err)
		}
		return sameValue(input.field(rule.Field), expected)
	}
	return false, fmt.Errorf("rule has no condition")
}

func (input ruleInput) field(path string) any {
	parts := strings.Split(path, ".")
	switch parts[0] {
	case "action":
		return input.action
	case "principal":
		return entityField(input.principal, parts[1:])
	case "resource":
		return entityField(input.resource, parts[1:])
	case "context":
		switch parts[1] {
		case "game":
			return input.execution.GameID
		case "session":
			return input.execution.SessionID
		case "origin":
			return input.execution.Origin
		case "attributes":
			return walk(input.execution.Attributes, parts[2:])
		case "operation":
			return walk(input.operation, parts[2:])
		}
	}
	return nil
}

func entityField(entity Entity, parts []string) any {
	switch parts[0] {
	case "id":
		return entity.ID
	case "type":
		return entity.Type
	case "attributes":
		return walk(entity.Attributes, parts[1:])
	}
	return nil
}

func walk(values map[string]any, parts []string) any {
	var value any = values
	for _, part := range parts {
		object, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		value = object[part]
	}
	return value
}

func normalizeOperation(operation map[string]any) (map[string]any, error) {
	if operation == nil {
		return nil, nil
	}
	data, err := json.Marshal(operation)
	if err != nil {
		return nil, fmt.Errorf("encode authorization context: %w", err)
	}
	var normalized map[string]any
	if err := json.Unmarshal(data, &normalized); err != nil {
		return nil, fmt.Errorf("decode authorization context: %w", err)
	}
	return normalized, nil
}

func sameValue(left, right any) (bool, error) {
	a, err := json.Marshal(left)
	if err != nil {
		return false, fmt.Errorf("compare values: %w", err)
	}
	b, err := json.Marshal(right)
	if err != nil {
		return false, fmt.Errorf("compare values: %w", err)
	}
	return bytes.Equal(a, b), nil
}
