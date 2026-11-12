package schema

import (
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

type Lookup func(id string) (string, error)

func (s *Schema) Validate(typeID string, data map[string]any) error {
	return s.ValidateWith(typeID, data, nil)
}

func (s *Schema) ValidateWith(typeID string, data map[string]any, lookup Lookup) error {
	found, err := s.Type(typeID)
	if err != nil {
		return err
	}
	if err := validateObject(data, found.Fields, data, typeID, false); err != nil {
		return err
	}
	if err := validateObject(data, found.Fields, data, typeID, true); err != nil {
		return err
	}
	if lookup == nil {
		return nil
	}
	return s.checkReferences(found.Fields, data, typeID, lookup)
}

func validateObject(root map[string]any, fields map[string]*Field, value map[string]any, path string, rules bool) error {
	names := make([]string, 0, len(value))
	for name := range value {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if _, declared := fields[name]; !declared {
			return fmt.Errorf("%s has undeclared field %s", path, name)
		}
	}
	declared := make([]string, 0, len(fields))
	for name := range fields {
		declared = append(declared, name)
	}
	sort.Strings(declared)
	for _, name := range declared {
		field := fields[name]
		item, present := value[name]
		if !present {
			if field.Required {
				return fmt.Errorf("%s is missing required field %s", path, name)
			}
			continue
		}
		if err := validateField(root, field, item, path+"."+name, rules); err != nil {
			return err
		}
	}
	return nil
}

func validateField(root map[string]any, field *Field, value any, path string, rules bool) error {
	if !hasType(field.Type, value) {
		return fmt.Errorf("%s must be %s", path, field.Type)
	}
	check := check
	if !rules {
		check = func(map[string]any, *Rules, any, string) error { return nil }
	}
	switch field.Type {
	case TypeField:
		if len(field.Fields) > 0 {
			if err := validateObject(root, field.Fields, value.(map[string]any), path, rules); err != nil {
				return err
			}
		}
		return check(root, field.Validate, value, path)
	case TypeArray, TypeSet:
		items := value.([]any)
		if !rules {
			return nil
		}
		if err := checkSize(root, field.Size, len(items), path); err != nil {
			return err
		}
		for index, item := range items {
			if err := check(root, field.Validate, item, fmt.Sprintf("%s[%d]", path, index)); err != nil {
				return err
			}
		}
		return nil
	case TypeMap:
		entries := value.(map[string]any)
		if !rules {
			return nil
		}
		if err := checkSize(root, field.Size, len(entries), path); err != nil {
			return err
		}
		keys := make([]string, 0, len(entries))
		for key := range entries {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			if err := check(root, field.Keys, key, path+" key "+key); err != nil {
				return err
			}
			if err := check(root, field.Validate, entries[key], path+"."+key); err != nil {
				return err
			}
		}
		return nil
	}
	return check(root, field.Validate, value, path)
}

func hasType(name string, value any) bool {
	if _, reference := strings.CutPrefix(name, "*"); reference {
		id, ok := value.(string)
		return ok && id != ""
	}
	switch name {
	case TypeString:
		_, ok := value.(string)
		return ok
	case TypeBoolean:
		_, ok := value.(bool)
		return ok
	case TypeInteger:
		number, ok := rational(value)
		return ok && number.IsInt() && number.Num().IsInt64()
	case TypeNumber, TypeDecimal:
		_, ok := rational(value)
		return ok
	case TypeDatetime:
		text, ok := value.(string)
		if !ok {
			return false
		}
		_, err := time.Parse(time.RFC3339Nano, text)
		return err == nil
	case TypeNull:
		return value == nil
	case TypeField, TypeMap:
		_, ok := value.(map[string]any)
		return ok
	case TypeArray:
		_, ok := value.([]any)
		return ok
	case TypeSet:
		items, ok := value.([]any)
		if !ok {
			return false
		}
		for i := range items {
			for j := i + 1; j < len(items); j++ {
				if same(items[i], items[j]) {
					return false
				}
			}
		}
		return true
	}
	return false
}

func rational(value any) (*big.Rat, bool) {
	switch number := value.(type) {
	case json.Number:
		return new(big.Rat).SetString(string(number))
	case float64:
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return nil, false
		}
		return new(big.Rat).SetFloat64(number), true
	case float32:
		return rational(float64(number))
	case int:
		return new(big.Rat).SetInt64(int64(number)), true
	case int32:
		return new(big.Rat).SetInt64(int64(number)), true
	case int64:
		return new(big.Rat).SetInt64(number), true
	}
	return nil, false
}

func same(left, right any) bool {
	a, leftNumber := rational(left)
	b, rightNumber := rational(right)
	if leftNumber || rightNumber {
		return leftNumber && rightNumber && a.Cmp(b) == 0
	}
	x, errX := json.Marshal(left)
	y, errY := json.Marshal(right)
	return errX == nil && errY == nil && string(x) == string(y)
}

func resolve(root map[string]any, operand *Operand, path string) (any, error) {
	if operand.Path == "" {
		return operand.Literal, nil
	}
	var value any = root
	for _, segment := range strings.Split(operand.Path, ".") {
		object, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s: referenced field %s is missing", path, operand.Path)
		}
		value, ok = object[segment]
		if !ok {
			return nil, fmt.Errorf("%s: referenced field %s is missing", path, operand.Path)
		}
	}
	return value, nil
}

func resolveNumber(root map[string]any, operand *Operand, path string) (*big.Rat, error) {
	value, err := resolve(root, operand, path)
	if err != nil {
		return nil, err
	}
	number, ok := rational(value)
	if !ok {
		return nil, fmt.Errorf("%s: bound %v is not a number", path, value)
	}
	return number, nil
}

func checkRange(root map[string]any, bounds *Bounds, value *big.Rat, path, what string) error {
	if bounds == nil {
		return nil
	}
	if bounds.Min != nil {
		minimum, err := resolveNumber(root, bounds.Min, path)
		if err != nil {
			return err
		}
		if value.Cmp(minimum) < 0 {
			return fmt.Errorf("%s %s %s is below the minimum %s", path, what, value.RatString(), minimum.RatString())
		}
	}
	if bounds.Max != nil {
		maximum, err := resolveNumber(root, bounds.Max, path)
		if err != nil {
			return err
		}
		if value.Cmp(maximum) > 0 {
			return fmt.Errorf("%s %s %s is above the maximum %s", path, what, value.RatString(), maximum.RatString())
		}
	}
	return nil
}

func checkSize(root map[string]any, bounds *Bounds, size int, path string) error {
	return checkRange(root, bounds, new(big.Rat).SetInt64(int64(size)), path, "size")
}

func check(root map[string]any, rules *Rules, value any, path string) error {
	if rules == nil {
		return nil
	}
	if len(rules.And) > 0 {
		for _, nested := range rules.And {
			if err := check(root, nested, value, path); err != nil {
				return err
			}
		}
		return nil
	}
	if len(rules.Or) > 0 {
		failures := []string{}
		for _, nested := range rules.Or {
			err := check(root, nested, value, path)
			if err == nil {
				return nil
			}
			failures = append(failures, err.Error())
		}
		return fmt.Errorf("%s matches none of the alternatives: %s", path, strings.Join(failures, "; "))
	}
	if rules.Type != "" && !hasType(rules.Type, value) {
		return fmt.Errorf("%s must be %s", path, rules.Type)
	}
	if rules.Between != nil || rules.Min != nil || rules.Max != nil || rules.MultipleOf != nil {
		number, ok := rational(value)
		if !ok {
			return fmt.Errorf("%s must be a number", path)
		}
		if err := checkRange(root, rules.Between, number, path, "value"); err != nil {
			return err
		}
		if err := checkRange(root, &Bounds{Min: rules.Min, Max: rules.Max}, number, path, "value"); err != nil {
			return err
		}
		if rules.MultipleOf != nil {
			step, err := resolveNumber(root, rules.MultipleOf, path)
			if err != nil {
				return err
			}
			if step.Sign() == 0 || !new(big.Rat).Quo(number, step).IsInt() {
				return fmt.Errorf("%s %s is not a multiple of %s", path, number.RatString(), step.RatString())
			}
		}
	}
	if rules.Length != nil || rules.Regex != nil {
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("%s must be a string", path)
		}
		if err := checkRange(root, rules.Length, new(big.Rat).SetInt64(int64(utf8.RuneCountInString(text))), path, "length"); err != nil {
			return err
		}
		if rules.Regex != nil && !rules.Regex.MatchString(text) {
			return fmt.Errorf("%s does not match the required pattern", path)
		}
	}
	if len(rules.In) > 0 {
		matched := false
		for index := range rules.In {
			allowed, err := resolve(root, &rules.In[index], path)
			if err != nil {
				return err
			}
			if same(value, allowed) {
				matched = true
				break
			}
		}
		if !matched {
			return fmt.Errorf("%s is not one of the allowed values", path)
		}
	}
	if rules.Not != nil && check(root, rules.Not, value, path) == nil {
		return fmt.Errorf("%s matches a rule it must not match", path)
	}
	return check(root, rules.Nested, value, path)
}

func (s *Schema) lookupReference(path, expected string, value any, lookup Lookup) error {
	id, _ := value.(string)
	actual, err := lookup(id)
	if err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	if !s.IsA(actual, expected) {
		return fmt.Errorf("%s references record %s of type %s, not %s", path, id, actual, expected)
	}
	return nil
}

func (s *Schema) checkReferences(fields map[string]*Field, value map[string]any, path string, lookup Lookup) error {
	names := make([]string, 0, len(fields))
	for name := range fields {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		item, present := value[name]
		if !present {
			continue
		}
		if err := s.checkFieldReferences(fields[name], item, path+"."+name, lookup); err != nil {
			return err
		}
	}
	return nil
}

func (s *Schema) checkFieldReferences(field *Field, value any, path string, lookup Lookup) error {
	if target, reference := field.Reference(); reference {
		return s.lookupReference(path, target, value, lookup)
	}
	switch field.Type {
	case TypeField:
		return s.checkReferences(field.Fields, value.(map[string]any), path, lookup)
	case TypeArray, TypeSet:
		for index, item := range value.([]any) {
			if err := s.checkRuleReferences(field.Validate, item, fmt.Sprintf("%s[%d]", path, index), lookup); err != nil {
				return err
			}
		}
	case TypeMap:
		entries := value.(map[string]any)
		keys := make([]string, 0, len(entries))
		for key := range entries {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			if err := s.checkRuleReferences(field.Validate, entries[key], path+"."+key, lookup); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Schema) checkRuleReferences(rules *Rules, value any, path string, lookup Lookup) error {
	if rules == nil {
		return nil
	}
	if target, reference := strings.CutPrefix(rules.Type, "*"); reference {
		if err := s.lookupReference(path, target, value, lookup); err != nil {
			return err
		}
	}
	for _, nested := range append([]*Rules{rules.Nested}, rules.And...) {
		if err := s.checkRuleReferences(nested, value, path, lookup); err != nil {
			return err
		}
	}
	return nil
}
