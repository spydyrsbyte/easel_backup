package schema

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"easel/internal/manifest"
)

type Type struct {
	ID     string
	Host   string
	Name   string
	Owner  string
	Parent string
	Local  map[string]*Field
	Fields map[string]*Field
	Meta   Meta
}

type Schema struct {
	Types map[string]*Type
}

func (s *Schema) Type(id string) (*Type, error) {
	found, ok := s.Types[id]
	if !ok {
		return nil, fmt.Errorf("unknown record type %s", id)
	}
	return found, nil
}

func (s *Schema) Names() []string {
	names := make([]string, 0, len(s.Types))
	for name := range s.Types {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func Qualify(host, name string) string {
	if strings.Contains(name, ".") {
		return name
	}
	return host + "." + name
}

func Declarations(pkg manifest.Package) ([]Declaration, error) {
	declarations := []Declaration{}
	for index, raw := range pkg.Manifest.Server.Data {
		declaration, err := ParseDeclaration(raw)
		if err != nil {
			return nil, fmt.Errorf("%s data[%d]: %w", pkg.ID(), index, err)
		}
		if declaration.File == "" {
			declaration.Source = fmt.Sprintf("data[%d]", index)
			declarations = append(declarations, declaration)
			continue
		}
		file, err := manifest.CleanPath(declaration.File)
		if err != nil {
			return nil, fmt.Errorf("%s data[%d] .file: %w", pkg.ID(), index, err)
		}
		if pkg.Files == nil {
			return nil, fmt.Errorf("%s data file %s: package has no files", pkg.ID(), file)
		}
		contents, err := fs.ReadFile(pkg.Files, file)
		if err != nil {
			return nil, fmt.Errorf("%s data file: %w", pkg.ID(), err)
		}
		var entries []json.RawMessage
		if err := json.Unmarshal(contents, &entries); err != nil {
			return nil, fmt.Errorf("%s data file %s must be a JSON list: %w", pkg.ID(), file, err)
		}
		for entry, raw := range entries {
			nested, err := ParseDeclaration(raw)
			if err != nil {
				return nil, fmt.Errorf("%s %s[%d]: %w", pkg.ID(), file, entry, err)
			}
			if nested.File != "" {
				return nil, fmt.Errorf("%s %s[%d]: data files cannot reference other files", pkg.ID(), file, entry)
			}
			nested.Source = fmt.Sprintf("%s[%d]", file, entry)
			declarations = append(declarations, nested)
		}
	}
	return declarations, nil
}

type Contribution struct {
	Package     manifest.Package
	Declaration Declaration
}

func PackageRules(packages []manifest.Package) ([]Contribution, error) {
	rules := []Contribution{}
	for _, pkg := range packages {
		declarations, err := Declarations(pkg)
		if err != nil {
			return nil, err
		}
		for _, declaration := range declarations {
			rules = append(rules, Contribution{Package: pkg, Declaration: declaration})
		}
	}
	return rules, nil
}

func Compose(packages []manifest.Package) (*Schema, error) {
	rules, err := PackageRules(packages)
	if err != nil {
		return nil, err
	}
	return ComposeRules(rules)
}

func ComposeRules(rules []Contribution) (*Schema, error) {
	composed := &Schema{Types: map[string]*Type{}}
	type contribution struct {
		pkg          manifest.Package
		declarations []Declaration
	}
	contributions := []contribution{}
	for _, rule := range rules {
		declaration, err := ParseDeclaration(rule.Declaration.Raw)
		if err != nil {
			return nil, err
		}
		contributions = append(contributions, contribution{rule.Package, []Declaration{declaration}})
	}
	for _, c := range contributions {
		for _, declaration := range c.declarations {
			if declaration.Name == "" {
				continue
			}
			id := Qualify(c.pkg.Manifest.Namespace(), declaration.Name)
			if existing, found := composed.Types[id]; found {
				return nil, fmt.Errorf("record type %s is defined by both %s and %s", id, existing.Owner, c.pkg.ID())
			}
			created := &Type{ID: id, Host: c.pkg.Manifest.Namespace(), Name: declaration.Name, Owner: c.pkg.ID(), Local: map[string]*Field{}, Meta: declaration.Meta}
			if declaration.Extends != "" {
				created.Parent = Qualify(c.pkg.Manifest.Namespace(), declaration.Extends)
			}
			if err := addFields(created, declaration.Fields, c.pkg); err != nil {
				return nil, err
			}
			composed.Types[id] = created
		}
	}
	for _, c := range contributions {
		for _, declaration := range c.declarations {
			if declaration.Modify == "" {
				continue
			}
			id := Qualify(c.pkg.Manifest.Namespace(), declaration.Modify)
			target, found := composed.Types[id]
			if !found {
				return nil, fmt.Errorf("%s modifies record type %s, which no package defines", c.pkg.ID(), id)
			}
			if err := addFields(target, declaration.Fields, c.pkg); err != nil {
				return nil, err
			}
		}
	}
	for _, name := range composed.Names() {
		if err := composed.flatten(composed.Types[name], map[string]bool{}); err != nil {
			return nil, err
		}
	}
	for _, name := range composed.Names() {
		found := composed.Types[name]
		for fieldName, field := range found.Fields {
			if err := composed.check(found, field, fieldName); err != nil {
				return nil, fmt.Errorf("record type %s: %w", name, err)
			}
		}
	}
	return composed, nil
}

func addFields(target *Type, fields map[string]*Field, pkg manifest.Package) error {
	for name, field := range fields {
		if existing, found := target.Local[name]; found {
			return fmt.Errorf("%s adds field %s to record type %s, which %s already defines", pkg.ID(), name, target.ID, existing.Owner)
		}
		qualifyField(field, pkg.Manifest.Namespace())
		field.Owner = pkg.ID()
		target.Local[name] = field
	}
	return nil
}

func qualifyType(name, host string) string {
	if target, reference := strings.CutPrefix(name, "*"); reference {
		return "*" + Qualify(host, target)
	}
	return name
}

func qualifyField(field *Field, host string) {
	field.Type = qualifyType(field.Type, host)
	qualifyRules(field.Validate, host)
	qualifyRules(field.Keys, host)
	for _, nested := range field.Fields {
		qualifyField(nested, host)
	}
}

func qualifyRules(rules *Rules, host string) {
	if rules == nil {
		return
	}
	rules.Type = qualifyType(rules.Type, host)
	qualifyRules(rules.Not, host)
	qualifyRules(rules.Nested, host)
	for _, list := range [][]*Rules{rules.And, rules.Or} {
		for _, nested := range list {
			qualifyRules(nested, host)
		}
	}
}

func (s *Schema) check(root *Type, field *Field, path string) error {
	if err := s.checkType(field.Type, path); err != nil {
		return err
	}
	for _, rules := range []*Rules{field.Validate, field.Keys} {
		if err := s.checkRules(root, rules, path); err != nil {
			return err
		}
	}
	if field.Size != nil {
		if err := checkBounds(root, field.Size, path+" .size"); err != nil {
			return err
		}
	}
	for name, nested := range field.Fields {
		if err := s.check(root, nested, path+"."+name); err != nil {
			return err
		}
	}
	return nil
}

func (s *Schema) checkType(name, path string) error {
	if target, reference := strings.CutPrefix(name, "*"); reference {
		if _, found := s.Types[target]; !found {
			return fmt.Errorf("field %s references unknown record type %s", path, target)
		}
	}
	return nil
}

func (s *Schema) checkRules(root *Type, rules *Rules, path string) error {
	if rules == nil {
		return nil
	}
	if rules.Type != "" {
		if err := s.checkType(rules.Type, path); err != nil {
			return err
		}
	}
	operands := append([]Operand(nil), rules.In...)
	for _, operand := range []*Operand{rules.Min, rules.Max, rules.MultipleOf} {
		if operand != nil {
			operands = append(operands, *operand)
		}
	}
	for _, bounds := range []*Bounds{rules.Between, rules.Length} {
		if bounds != nil {
			for _, operand := range []*Operand{bounds.Min, bounds.Max} {
				if operand != nil {
					operands = append(operands, *operand)
				}
			}
		}
	}
	for _, operand := range operands {
		if err := checkReference(root, operand, path); err != nil {
			return err
		}
	}
	for _, nested := range append(append([]*Rules{rules.Not, rules.Nested}, rules.And...), rules.Or...) {
		if err := s.checkRules(root, nested, path); err != nil {
			return err
		}
	}
	return nil
}

func checkBounds(root *Type, bounds *Bounds, path string) error {
	for _, operand := range []*Operand{bounds.Min, bounds.Max} {
		if operand != nil {
			if err := checkReference(root, *operand, path); err != nil {
				return err
			}
		}
	}
	return nil
}

func checkReference(root *Type, operand Operand, path string) error {
	if operand.Path == "" {
		return nil
	}
	fields := root.Fields
	segments := strings.Split(operand.Path, ".")
	for index, segment := range segments {
		field, found := fields[segment]
		if !found {
			return fmt.Errorf("field %s references %s, which record type %s does not define", path, operand.Path, root.ID)
		}
		if index < len(segments)-1 {
			if field.Type != TypeField {
				return fmt.Errorf("field %s references %s, which passes through non-field %s", path, operand.Path, segment)
			}
			fields = field.Fields
		}
	}
	return nil
}

func (s *Schema) flatten(t *Type, visiting map[string]bool) error {
	if t.Fields != nil {
		return nil
	}
	if visiting[t.ID] {
		return fmt.Errorf("record type %s extends itself", t.ID)
	}
	visiting[t.ID] = true
	fields := map[string]*Field{}
	if t.Parent != "" {
		parent, found := s.Types[t.Parent]
		if !found {
			return fmt.Errorf("record type %s extends %s, which no package defines", t.ID, t.Parent)
		}
		if err := s.flatten(parent, visiting); err != nil {
			return err
		}
		for name, field := range parent.Fields {
			fields[name] = field
		}
	}
	for name, field := range t.Local {
		if inherited, found := fields[name]; found {
			return fmt.Errorf("record type %s redeclares field %s inherited from %s (added by %s)", t.ID, name, t.Parent, inherited.Owner)
		}
		fields[name] = field
	}
	t.Fields = fields
	return nil
}

func (s *Schema) IsA(actual, expected string) bool {
	for current := actual; current != ""; {
		if current == expected {
			return true
		}
		found, ok := s.Types[current]
		if !ok {
			return false
		}
		current = found.Parent
	}
	return false
}
