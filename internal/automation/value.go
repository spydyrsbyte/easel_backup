package automation

import (
	"encoding/json"
	"fmt"
	"math/big"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"easel/internal/ident"
)

func (frame *frame) evaluate(value any) (any, error) {
	switch value := value.(type) {
	case []any:
		result := make([]any, len(value))
		for index, item := range value {
			evaluated, err := frame.evaluate(item)
			if err != nil {
				return nil, err
			}
			result[index] = evaluated
		}
		return result, nil
	case map[string]any:
		if len(value) == 1 {
			if name, found := value["context"]; found {
				key, ok := name.(string)
				if !ok {
					return nil, fmt.Errorf("context requires a field name")
				}
				result, found := frame.environment[key]
				if !found {
					return nil, fmt.Errorf("unknown execution context %q", key)
				}
				return clone(result)
			}
			if literal, found := value["literal"]; found {
				return clone(literal)
			}
			if name, found := value["arg"]; found {
				key, ok := name.(string)
				if !ok {
					return nil, fmt.Errorf("arg requires a name")
				}
				result, found := frame.arguments[key]
				if !found {
					return nil, fmt.Errorf("unknown argument %q", key)
				}
				return result, nil
			}
			if name, found := value["var"]; found {
				key, ok := name.(string)
				if !ok {
					return nil, fmt.Errorf("var requires a name")
				}
				return frame.variable(key)
			}
			if path, found := value["path"]; found {
				return frame.readPath(path)
			}
		}
		if operator, found := value["expr"]; found {
			name, ok := operator.(string)
			if !ok {
				return nil, fmt.Errorf("expression requires an operator name")
			}
			arguments, ok := value["args"].([]any)
			if !ok {
				return nil, fmt.Errorf("expression args must be a list")
			}
			if name == "exists" {
				if len(arguments) != 1 {
					return nil, fmt.Errorf("exists requires one argument")
				}
				_, err := frame.evaluate(arguments[0])
				return err == nil, nil
			}
			result := make([]any, len(arguments))
			for index, argument := range arguments {
				evaluated, err := frame.evaluate(argument)
				if err != nil {
					return nil, err
				}
				result[index] = evaluated
				if name == "and" || name == "or" {
					truth, ok := evaluated.(bool)
					if !ok {
						return nil, fmt.Errorf("%s requires booleans", name)
					}
					if name == "and" && !truth {
						return false, nil
					}
					if name == "or" && truth {
						return true, nil
					}
				}
			}
			return expression(name, result)
		}
		result := map[string]any{}
		for key, item := range value {
			evaluated, err := frame.evaluate(item)
			if err != nil {
				return nil, err
			}
			result[key] = evaluated
		}
		return result, nil
	default:
		return value, nil
	}
}

func (frame *frame) variable(name string) (any, error) {
	if value, found := frame.variables[name]; found {
		return value, nil
	}
	if value, found := frame.arguments[name]; found {
		return value, nil
	}
	return nil, fmt.Errorf("unknown variable %q", name)
}

func (frame *frame) path(raw any) ([]any, error) {
	path, ok := raw.([]any)
	if !ok || len(path) == 0 {
		return nil, fmt.Errorf("path requires variable and optional field/index segments")
	}
	result := make([]any, len(path))
	copy(result, path)
	if _, ok := path[0].(string); !ok {
		return nil, fmt.Errorf("path must start with a variable name")
	}
	for index := 1; index < len(path); index++ {
		value, err := frame.evaluate(path[index])
		if err != nil {
			return nil, err
		}
		result[index] = value
	}
	return result, nil
}

func descend(value, key any) (any, error) {
	switch value := value.(type) {
	case map[string]any:
		name, ok := key.(string)
		if !ok {
			return nil, fmt.Errorf("object field must be a string")
		}
		child, found := value[name]
		if !found {
			return nil, fmt.Errorf("missing field %q", name)
		}
		return child, nil
	case []any:
		index, err := listIndex(key, len(value))
		if err != nil {
			return nil, err
		}
		return value[index], nil
	default:
		return nil, fmt.Errorf("cannot access a field or index on %T", value)
	}
}

func (frame *frame) readPath(raw any) (any, error) {
	path, err := frame.path(raw)
	if err != nil {
		return nil, err
	}
	value, err := frame.variable(path[0].(string))
	if err != nil {
		return nil, err
	}
	for _, segment := range path[1:] {
		value, err = descend(value, segment)
		if err != nil {
			return nil, err
		}
	}
	return value, nil
}

func (frame *frame) assign(target, value any) error {
	object, ok := target.(map[string]any)
	if !ok || len(object) != 1 {
		return fmt.Errorf("target must be a var or path reference")
	}
	if name, found := object["var"]; found {
		key, ok := name.(string)
		if !ok || !ident.Valid(key) {
			return fmt.Errorf("invalid target variable")
		}
		if frame.records[key] != nil {
			return fmt.Errorf("cannot replace loaded record")
		}
		copied, err := clone(value)
		if err == nil {
			frame.variables[key] = copied
		}
		return err
	}
	path, err := frame.path(object["path"])
	if err != nil {
		return err
	}
	if len(path) == 1 {
		return frame.assign(map[string]any{"var": path[0]}, value)
	}
	parent, err := frame.variable(path[0].(string))
	if err != nil {
		return err
	}
	for _, segment := range path[1 : len(path)-1] {
		parent, err = descend(parent, segment)
		if err != nil {
			return err
		}
	}
	copied, err := clone(value)
	if err != nil {
		return err
	}
	key := path[len(path)-1]
	switch parent := parent.(type) {
	case map[string]any:
		name, ok := key.(string)
		if !ok {
			return fmt.Errorf("object field must be string")
		}
		parent[name] = copied
	case []any:
		index, err := listIndex(key, len(parent))
		if err != nil {
			return err
		}
		parent[index] = copied
	default:
		return fmt.Errorf("target parent must be an object or list")
	}
	return nil
}

func number(value any) (*big.Rat, error) {
	var text string
	switch value := value.(type) {
	case json.Number:
		text = string(value)
	case int:
		text = strconv.Itoa(value)
	case int64:
		text = strconv.FormatInt(value, 10)
	case float64:
		text = strconv.FormatFloat(value, 'g', -1, 64)
	default:
		return nil, fmt.Errorf("expected number, got %T", value)
	}
	number, ok := new(big.Rat).SetString(text)
	if !ok {
		return nil, fmt.Errorf("invalid number %q", text)
	}
	return number, nil
}

func decimal(value *big.Rat) json.Number {
	denominator := new(big.Int).Set(value.Denom())
	two, five := 0, 0
	for _, factor := range []int64{2, 5} {
		for new(big.Int).Mod(denominator, big.NewInt(factor)).Sign() == 0 {
			denominator.Quo(denominator, big.NewInt(factor))
			if factor == 2 {
				two++
			} else {
				five++
			}
		}
	}
	places := 16
	if denominator.Cmp(big.NewInt(1)) == 0 {
		places = max(two, five)
	}
	text := value.FloatString(places)
	if strings.Contains(text, ".") {
		text = strings.TrimRight(strings.TrimRight(text, "0"), ".")
	}
	if text == "-0" {
		text = "0"
	}
	return json.Number(text)
}

func arithmetic(operator string, left, right any) (any, error) {
	a, err := number(left)
	if err != nil {
		return nil, err
	}
	b, err := number(right)
	if err != nil {
		return nil, err
	}
	switch operator {
	case "add":
		a.Add(a, b)
	case "subtract":
		a.Sub(a, b)
	case "multiply":
		a.Mul(a, b)
	case "divide":
		if b.Sign() == 0 {
			return nil, fmt.Errorf("division by zero")
		}
		a.Quo(a, b)
	default:
		return nil, fmt.Errorf("unknown arithmetic operator")
	}
	return decimal(a), nil
}

func listIndex(value any, length int) (int, error) {
	number, err := number(value)
	if err != nil || !number.IsInt() || !number.Num().IsInt64() {
		return 0, fmt.Errorf("list index must be an integer")
	}
	index := number.Num().Int64()
	if index < 0 || index >= int64(length) {
		return 0, fmt.Errorf("list index %d out of range", index)
	}
	return int(index), nil
}

func Equal(left, right any) bool {
	a, errA := number(left)
	b, errB := number(right)
	if errA == nil && errB == nil {
		return a.Cmp(b) == 0
	}
	switch left := left.(type) {
	case []any:
		right, ok := right.([]any)
		if !ok || len(left) != len(right) {
			return false
		}
		for index, value := range left {
			if !Equal(value, right[index]) {
				return false
			}
		}
		return true
	case map[string]any:
		right, ok := right.(map[string]any)
		if !ok || len(left) != len(right) {
			return false
		}
		for key, value := range left {
			other, found := right[key]
			if !found || !Equal(value, other) {
				return false
			}
		}
		return true
	}
	return reflect.DeepEqual(left, right)
}

func expression(operator string, args []any) (any, error) {
	arity := func(count int) error {
		if len(args) != count {
			return fmt.Errorf("%s expects %d arguments", operator, count)
		}
		return nil
	}
	switch operator {
	case "and":
		return true, nil
	case "or":
		return false, nil
	case "not":
		if err := arity(1); err != nil {
			return nil, err
		}
		value, ok := args[0].(bool)
		if !ok {
			return nil, fmt.Errorf("not requires boolean")
		}
		return !value, nil
	case "add", "subtract", "multiply", "divide":
		if err := arity(2); err != nil {
			return nil, err
		}
		return arithmetic(operator, args[0], args[1])
	case "equals", "notEquals":
		if err := arity(2); err != nil {
			return nil, err
		}
		result := Equal(args[0], args[1])
		if operator == "notEquals" {
			result = !result
		}
		return result, nil
	case "lessThan", "lessOrEqual", "greaterThan", "greaterOrEqual":
		if err := arity(2); err != nil {
			return nil, err
		}
		var comparison int
		if left, ok := args[0].(string); ok {
			right, ok := args[1].(string)
			if !ok {
				return nil, fmt.Errorf("comparison types differ")
			}
			comparison = strings.Compare(left, right)
		} else {
			left, err := number(args[0])
			if err != nil {
				return nil, err
			}
			right, err := number(args[1])
			if err != nil {
				return nil, err
			}
			comparison = left.Cmp(right)
		}
		switch operator {
		case "lessThan":
			return comparison < 0, nil
		case "lessOrEqual":
			return comparison <= 0, nil
		case "greaterThan":
			return comparison > 0, nil
		default:
			return comparison >= 0, nil
		}
	case "concat":
		var result strings.Builder
		for _, arg := range args {
			text, ok := arg.(string)
			if !ok {
				return nil, fmt.Errorf("concat requires strings")
			}
			result.WriteString(text)
		}
		return result.String(), nil
	case "length":
		if err := arity(1); err != nil {
			return nil, err
		}
		switch value := args[0].(type) {
		case string:
			return utf8.RuneCountInString(value), nil
		case []any:
			return len(value), nil
		case map[string]any:
			return len(value), nil
		}
		return nil, fmt.Errorf("length requires string, list or object")
	case "contains":
		if err := arity(2); err != nil {
			return nil, err
		}
		switch value := args[0].(type) {
		case string:
			part, ok := args[1].(string)
			if !ok {
				return nil, fmt.Errorf("string contains requires string")
			}
			return strings.Contains(value, part), nil
		case []any:
			for _, item := range value {
				if Equal(item, args[1]) {
					return true, nil
				}
			}
			return false, nil
		case map[string]any:
			key, ok := args[1].(string)
			if !ok {
				return nil, fmt.Errorf("object contains requires field name")
			}
			_, found := value[key]
			return found, nil
		}
		return nil, fmt.Errorf("contains requires string, list or object")
	case "get":
		if err := arity(2); err != nil {
			return nil, err
		}
		return descend(args[0], args[1])
	case "list":
		return args, nil
	case "split":
		if err := arity(2); err != nil {
			return nil, err
		}
		text, ok := args[0].(string)
		if !ok {
			return nil, fmt.Errorf("split requires text")
		}
		separator, ok := args[1].(string)
		if !ok {
			return nil, fmt.Errorf("split separator must be text")
		}
		parts := strings.Split(text, separator)
		result := make([]any, len(parts))
		for index, part := range parts {
			result[index] = part
		}
		return result, nil
	case "join":
		if err := arity(2); err != nil {
			return nil, err
		}
		list, ok := args[0].([]any)
		if !ok {
			return nil, fmt.Errorf("join requires list")
		}
		separator, ok := args[1].(string)
		if !ok {
			return nil, fmt.Errorf("join separator must be text")
		}
		parts := make([]string, len(list))
		for index, item := range list {
			text, ok := item.(string)
			if !ok {
				return nil, fmt.Errorf("join requires list of strings")
			}
			parts[index] = text
		}
		return strings.Join(parts, separator), nil
	case "keys":
		if err := arity(1); err != nil {
			return nil, err
		}
		object, ok := args[0].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("keys requires object")
		}
		keys := make([]string, 0, len(object))
		for key := range object {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		result := make([]any, len(keys))
		for index, key := range keys {
			result[index] = key
		}
		return result, nil
	default:
		return nil, fmt.Errorf("unknown expression %q", operator)
	}
}

func ValidNumber(text string) bool {
	_, err := number(json.Number(text))
	return err == nil
}
