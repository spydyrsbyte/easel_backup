package schema

import (
	"encoding/json"
)

func (t *Type) JSON() ([]byte, error) {
	document := map[string]any{".name": t.ID, ".owner": t.Owner}
	if t.Parent != "" {
		document[".extends"] = t.Parent
	}
	for key, value := range t.Meta {
		document[key] = value
	}
	for name, field := range t.Fields {
		document[name] = fieldDocument(field, true)
	}
	return json.Marshal(document)
}

func fieldDocument(field *Field, topLevel bool) map[string]any {
	document := map[string]any{".type": field.Type}
	for key, value := range field.Meta {
		document[key] = value
	}
	if topLevel {
		document[".owner"] = field.Owner
	}
	if field.HasDefault {
		document[".default"] = field.Default
	}
	if !field.Required {
		document[".required"] = false
	}
	if field.Validate != nil {
		document[".validate"] = rulesDocument(field.Validate)
	}
	if field.Keys != nil {
		document[".keys"] = rulesDocument(field.Keys)
	}
	if field.Size != nil {
		document[".size"] = boundsDocument(field.Size)
	}
	for name, nested := range field.Fields {
		document[name] = fieldDocument(nested, false)
	}
	return document
}

func operandDocument(operand *Operand) any {
	if operand.Path != "" {
		return map[string]any{"@": operand.Path}
	}
	return operand.Literal
}

func boundsDocument(bounds *Bounds) map[string]any {
	document := map[string]any{}
	if bounds.Min != nil {
		document["min"] = operandDocument(bounds.Min)
	}
	if bounds.Max != nil {
		document["max"] = operandDocument(bounds.Max)
	}
	return document
}

func rulesDocument(rules *Rules) map[string]any {
	document := map[string]any{}
	for key, value := range rules.Meta {
		document[key] = value
	}
	if rules.Type != "" {
		document[".type"] = rules.Type
	}
	for key, bounds := range map[string]*Bounds{".between": rules.Between, ".length": rules.Length} {
		if bounds != nil {
			document[key] = boundsDocument(bounds)
		}
	}
	for key, operand := range map[string]*Operand{".min": rules.Min, ".max": rules.Max, ".multipleOf": rules.MultipleOf} {
		if operand != nil {
			document[key] = operandDocument(operand)
		}
	}
	if rules.Pattern != "" {
		document[".regex"] = rules.Pattern
	}
	if len(rules.In) > 0 {
		values := []any{}
		for index := range rules.In {
			values = append(values, operandDocument(&rules.In[index]))
		}
		document[".in"] = values
	}
	if rules.Not != nil {
		document[".not"] = rulesDocument(rules.Not)
	}
	if rules.Nested != nil {
		document[".validate"] = rulesDocument(rules.Nested)
	}
	for key, list := range map[string][]*Rules{".and": rules.And, ".or": rules.Or} {
		if len(list) > 0 {
			items := []any{}
			for _, nested := range list {
				items = append(items, rulesDocument(nested))
			}
			document[key] = items
		}
	}
	return document
}
