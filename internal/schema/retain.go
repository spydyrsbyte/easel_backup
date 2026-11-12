package schema

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"easel/internal/manifest"
)

func RetainRules(saved []Contribution, packages []manifest.Package) ([]Contribution, *Schema, error) {
	incoming, err := PackageRules(packages)
	if err != nil {
		return nil, nil, err
	}
	rules := append([]Contribution(nil), saved...)
	positions := map[string]int{}
	for index, rule := range rules {
		positions[rule.Package.ID()+"/"+rule.Declaration.Source] = index
	}
	for _, rule := range incoming {
		key := rule.Package.ID() + "/" + rule.Declaration.Source
		if index, found := positions[key]; found {
			merged, err := retainDeclaration(rules[index].Declaration, rule.Declaration)
			if err != nil {
				return nil, nil, fmt.Errorf("schema contribution %s requires an explicit migration: %w", key, err)
			}
			rule.Declaration = merged
			rules[index] = rule
		} else {
			positions[key] = len(rules)
			rules = append(rules, rule)
		}
	}
	composed, err := ComposeRules(rules)
	return rules, composed, err
}

func retainDeclaration(saved, incoming Declaration) (Declaration, error) {
	var before, after map[string]json.RawMessage
	if err := json.Unmarshal(saved.Raw, &before); err != nil {
		return Declaration{}, err
	}
	if err := json.Unmarshal(incoming.Raw, &after); err != nil {
		return Declaration{}, err
	}
	for _, key := range []string{".name", ".modify", ".extends"} {
		if !sameJSON(before[key], after[key]) {
			return Declaration{}, fmt.Errorf("%s changed", key)
		}
	}
	for key, value := range before {
		if replacement, found := after[key]; found {
			if !strings.HasPrefix(key, ".") && !sameJSON(value, replacement) {
				return Declaration{}, fmt.Errorf("field %s changed", key)
			}
		} else {
			after[key] = value
		}
	}
	raw, err := json.Marshal(after)
	if err != nil {
		return Declaration{}, err
	}
	result, err := ParseDeclaration(raw)
	result.Source = incoming.Source
	return result, err
}

func sameJSON(left, right json.RawMessage) bool {
	if len(left) == 0 || len(right) == 0 {
		return len(left) == len(right)
	}
	a, leftErr := decodeLiteral(left)
	b, rightErr := decodeLiteral(right)
	return leftErr == nil && rightErr == nil && reflect.DeepEqual(a, b)
}
