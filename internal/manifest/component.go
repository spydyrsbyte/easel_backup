package manifest

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

func validateClientContract(data []byte) error {
	var definition map[string]json.RawMessage
	if err := json.Unmarshal(data, &definition); err != nil || definition == nil {
		return fmt.Errorf("interface definition must be an object")
	}
	var kind string
	_ = json.Unmarshal(definition["kind"], &kind)
	if kind != "component" {
		return nil
	}
	objects := map[string]map[string]json.RawMessage{}
	for _, name := range []string{"properties", "events", "slots"} {
		var fields map[string]json.RawMessage
		if json.Unmarshal(definition[name], &fields) != nil || fields == nil {
			return fmt.Errorf("component %s must be an object", name)
		}
		objects[name] = fields
	}
	for name, raw := range objects["properties"] {
		var rule struct {
			Type    string          `json:"type"`
			Default json.RawMessage `json:"default"`
		}
		if json.Unmarshal(raw, &rule) != nil {
			return fmt.Errorf("invalid component property %s", name)
		}
		if err := componentType(rule.Type, rule.Default); err != nil {
			return fmt.Errorf("component property %s: %w", name, err)
		}
	}
	for name, raw := range objects["events"] {
		var event struct {
			Payload map[string]json.RawMessage `json:"payload"`
		}
		if json.Unmarshal(raw, &event) != nil || event.Payload == nil {
			return fmt.Errorf("component event %s requires a payload object", name)
		}
		for field, raw := range event.Payload {
			var rule struct {
				Type string `json:"type"`
			}
			var simple string
			if json.Unmarshal(raw, &simple) == nil {
				rule.Type = simple
			} else if json.Unmarshal(raw, &rule) != nil {
				return fmt.Errorf("invalid event field %s.%s", name, field)
			}
			if err := componentType(rule.Type, nil); err != nil {
				return err
			}
		}
	}
	return nil
}

func componentType(kind string, value json.RawMessage) error {
	var v any
	if value != nil {
		if err := json.Unmarshal(value, &v); err != nil {
			return err
		}
	}
	valid := false
	switch strings.ToLower(kind) {
	case "string":
		_, valid = v.(string)
	case "boolean":
		_, valid = v.(bool)
	case "number":
		_, valid = v.(float64)
	case "integer":
		n, ok := v.(float64)
		valid = ok && n == math.Trunc(n)
	case "object":
		_, valid = v.(map[string]any)
	case "array":
		_, valid = v.([]any)
	case "null":
		valid = v == nil
	default:
		return fmt.Errorf("unsupported component type %q", kind)
	}
	if value != nil && !valid {
		return fmt.Errorf("default must have type %s", kind)
	}
	return nil
}
