package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"

	"easel/internal/ident"
)

const (
	TypeString   = "string"
	TypeBoolean  = "boolean"
	TypeInteger  = "integer"
	TypeNumber   = "number"
	TypeDecimal  = "decimal"
	TypeDatetime = "datetime"
	TypeNull     = "null"
	TypeField    = "field"
	TypeArray    = "array"
	TypeSet      = "set"
	TypeMap      = "map"
)

var ReservedFields = map[string]bool{"id": true, "type": true, "save": true, "remove": true, "_data": true}

var builtins = map[string]bool{TypeString: true, TypeBoolean: true, TypeInteger: true, TypeNumber: true, TypeDecimal: true, TypeDatetime: true, TypeNull: true, TypeField: true, TypeArray: true, TypeSet: true, TypeMap: true}

type Meta map[string]json.RawMessage

type Field struct {
	Type       string
	Default    any
	HasDefault bool
	Required   bool
	Validate   *Rules
	Size       *Bounds
	Keys       *Rules
	Fields     map[string]*Field
	Meta       Meta
	Owner      string
}

func (field *Field) Reference() (string, bool) {
	return strings.CutPrefix(field.Type, "*")
}

type Operand struct {
	Literal any
	Path    string
}

type Bounds struct {
	Min *Operand
	Max *Operand
}

type Rules struct {
	Type       string
	Between    *Bounds
	Min        *Operand
	Max        *Operand
	Length     *Bounds
	Regex      *regexp.Regexp
	Pattern    string
	In         []Operand
	MultipleOf *Operand
	Not        *Rules
	Nested     *Rules
	And        []*Rules
	Or         []*Rules
	Meta       Meta
}

type Declaration struct {
	Raw     json.RawMessage
	Source  string
	Name    string
	Extends string
	Modify  string
	File    string
	Fields  map[string]*Field
	Meta    Meta
}

func parseObject(data json.RawMessage, what string) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(data, &object); err != nil || object == nil {
		return nil, fmt.Errorf("%s must be an object", what)
	}
	return object, nil
}

func sortedKeys(object map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func decodeLiteral(data json.RawMessage) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, fmt.Errorf("trailing data after JSON value")
	}
	return value, nil
}

func parseString(data json.RawMessage, what string) (string, error) {
	var text string
	if err := json.Unmarshal(data, &text); err != nil || text == "" {
		return "", fmt.Errorf("%s must be a non-empty string", what)
	}
	return text, nil
}

func ParseDeclaration(data json.RawMessage) (Declaration, error) {
	object, err := parseObject(data, "data declaration")
	if err != nil {
		return Declaration{}, err
	}
	declaration := Declaration{Raw: data, Fields: map[string]*Field{}, Meta: Meta{}}
	kinds := 0
	for _, key := range sortedKeys(object) {
		value := object[key]
		switch {
		case key == ".name":
			if declaration.Name, err = parseString(value, ".name"); err != nil {
				return Declaration{}, err
			}
			kinds++
		case key == ".extends":
			if declaration.Extends, err = parseString(value, ".extends"); err != nil {
				return Declaration{}, err
			}
		case key == ".modify":
			if declaration.Modify, err = parseString(value, ".modify"); err != nil {
				return Declaration{}, err
			}
			kinds++
		case key == ".file":
			if declaration.File, err = parseString(value, ".file"); err != nil {
				return Declaration{}, err
			}
			kinds++
		case strings.HasPrefix(key, "."):
			declaration.Meta[key] = value
		default:
			field, err := parseField(value, key)
			if err != nil {
				return Declaration{}, err
			}
			declaration.Fields[key] = field
		}
	}
	if declaration.Extends != "" && declaration.Name == "" {
		return Declaration{}, fmt.Errorf(".extends requires .name")
	}
	if kinds != 1 {
		return Declaration{}, fmt.Errorf("data declaration requires exactly one of .name, .modify, or .file")
	}
	if declaration.Name != "" && !ident.JavaScript(declaration.Name) {
		return Declaration{}, fmt.Errorf("invalid type name %q: it must be a JavaScript identifier", declaration.Name)
	}
	for name := range declaration.Fields {
		if ReservedFields[name] {
			return Declaration{}, fmt.Errorf("field name %q is reserved for records", name)
		}
	}
	if declaration.File != "" && len(declaration.Fields) > 0 {
		return Declaration{}, fmt.Errorf("a .file declaration cannot declare fields")
	}
	return declaration, nil
}

func validType(name string) bool {
	if builtins[name] {
		return true
	}
	target, reference := strings.CutPrefix(name, "*")
	return reference && (ident.JavaScript(target) || ident.Qualified(target))
}

func parseField(data json.RawMessage, path string) (*Field, error) {
	object, err := parseObject(data, "field "+path)
	if err != nil {
		return nil, err
	}
	field := &Field{Required: true, Fields: map[string]*Field{}, Meta: Meta{}}
	for _, key := range sortedKeys(object) {
		value := object[key]
		switch {
		case key == ".type":
			if field.Type, err = parseString(value, path+" .type"); err != nil {
				return nil, err
			}
		case key == ".default":
			if field.Default, err = decodeLiteral(value); err != nil {
				return nil, fmt.Errorf("field %s .default: %w", path, err)
			}
			field.HasDefault = true
		case key == ".required":
			if err := json.Unmarshal(value, &field.Required); err != nil {
				return nil, fmt.Errorf("field %s .required must be a boolean", path)
			}
		case key == ".validate":
			if field.Validate, err = parseRules(value, path+" .validate"); err != nil {
				return nil, err
			}
		case key == ".size":
			if field.Size, err = parseBounds(value, path+" .size"); err != nil {
				return nil, err
			}
		case key == ".keys":
			if field.Keys, err = parseRules(value, path+" .keys"); err != nil {
				return nil, err
			}
		case strings.HasPrefix(key, "."):
			field.Meta[key] = value
		default:
			nested, err := parseField(value, path+"."+key)
			if err != nil {
				return nil, err
			}
			field.Fields[key] = nested
		}
	}
	if !validType(field.Type) {
		return nil, fmt.Errorf("field %s has invalid or missing .type %q", path, field.Type)
	}
	if len(field.Fields) > 0 && field.Type != TypeField {
		return nil, fmt.Errorf("field %s declares nested fields but is not a field type", path)
	}
	if field.Size != nil && field.Type != TypeArray && field.Type != TypeSet && field.Type != TypeMap {
		return nil, fmt.Errorf("field %s .size applies only to array, set, and map", path)
	}
	if field.Keys != nil && field.Type != TypeMap {
		return nil, fmt.Errorf("field %s .keys applies only to map", path)
	}
	return field, nil
}

func parseOperand(data json.RawMessage, what string) (*Operand, error) {
	if object, err := parseObject(data, what); err == nil {
		if reference, found := object["@"]; found && len(object) == 1 {
			path, err := parseString(reference, what+" @")
			if err != nil {
				return nil, err
			}
			return &Operand{Path: path}, nil
		}
	}
	literal, err := decodeLiteral(data)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", what, err)
	}
	return &Operand{Literal: literal}, nil
}

func parseBounds(data json.RawMessage, what string) (*Bounds, error) {
	object, err := parseObject(data, what)
	if err != nil {
		return nil, err
	}
	bounds := &Bounds{}
	for _, key := range sortedKeys(object) {
		switch key {
		case "min":
			bounds.Min, err = parseOperand(object[key], what+" min")
		case "max":
			bounds.Max, err = parseOperand(object[key], what+" max")
		default:
			return nil, fmt.Errorf("%s accepts only min and max", what)
		}
		if err != nil {
			return nil, err
		}
	}
	if bounds.Min == nil && bounds.Max == nil {
		return nil, fmt.Errorf("%s requires min or max", what)
	}
	return bounds, nil
}

func parseRuleList(data json.RawMessage, what string) ([]*Rules, error) {
	var items []json.RawMessage
	if err := json.Unmarshal(data, &items); err != nil || len(items) == 0 {
		return nil, fmt.Errorf("%s must be a non-empty list", what)
	}
	rules := make([]*Rules, 0, len(items))
	for index, item := range items {
		rule, err := parseRules(item, fmt.Sprintf("%s[%d]", what, index))
		if err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, nil
}

func parseRules(data json.RawMessage, what string) (*Rules, error) {
	object, err := parseObject(data, what)
	if err != nil {
		return nil, err
	}
	_, hasAnd := object[".and"]
	_, hasOr := object[".or"]
	if (hasAnd || hasOr) && len(object) != 1 {
		return nil, fmt.Errorf("%s: .and and .or must be the only rule in their .validate", what)
	}
	rules := &Rules{Meta: Meta{}}
	for _, key := range sortedKeys(object) {
		value := object[key]
		switch key {
		case ".type":
			if rules.Type, err = parseString(value, what+" .type"); err == nil && !validType(rules.Type) {
				err = fmt.Errorf("%s .type %q is not a type", what, rules.Type)
			}
		case ".between":
			rules.Between, err = parseBounds(value, what+" .between")
		case ".min":
			rules.Min, err = parseOperand(value, what+" .min")
		case ".max":
			rules.Max, err = parseOperand(value, what+" .max")
		case ".length":
			rules.Length, err = parseBounds(value, what+" .length")
		case ".regex":
			var source string
			if source, err = parseString(value, what+" .regex"); err == nil {
				rules.Pattern = source
				rules.Regex, err = regexp.Compile(`^(?:` + source + `)$`)
			}
		case ".in":
			var items []json.RawMessage
			if err = json.Unmarshal(value, &items); err != nil || len(items) == 0 {
				err = fmt.Errorf("%s .in must be a non-empty list", what)
				break
			}
			for index, item := range items {
				operand, itemErr := parseOperand(item, fmt.Sprintf("%s .in[%d]", what, index))
				if itemErr != nil {
					err = itemErr
					break
				}
				rules.In = append(rules.In, *operand)
			}
		case ".multipleOf":
			rules.MultipleOf, err = parseOperand(value, what+" .multipleOf")
		case ".not":
			rules.Not, err = parseRules(value, what+" .not")
		case ".validate":
			rules.Nested, err = parseRules(value, what+" .validate")
		case ".and":
			rules.And, err = parseRuleList(value, what+" .and")
		case ".or":
			rules.Or, err = parseRuleList(value, what+" .or")
		default:
			if !strings.HasPrefix(key, ".") {
				return nil, fmt.Errorf("%s: rule %q must start with a dot", what, key)
			}
			rules.Meta[key] = value
		}
		if err != nil {
			return nil, err
		}
	}
	return rules, nil
}
