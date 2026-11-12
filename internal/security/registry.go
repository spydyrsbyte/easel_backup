package security

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"easel/internal/ident"
)

type RelationshipDefinition struct {
	Subject      string `json:"subject"`
	Object       string `json:"object"`
	AddAction    string `json:"addAction"`
	RemoveAction string `json:"removeAction"`
	Membership   bool   `json:"membership,omitempty"`
}

type Permission struct {
	Resource      string `json:"resource"`
	Action        string `json:"action"`
	Configurable  bool   `json:"configurable"`
	TypeScope     bool   `json:"typeScope"`
	InstanceScope bool   `json:"instanceScope"`
	ManageAction  string `json:"manageAction"`
}

type GroupDefinition struct {
	CreateAction string `json:"createAction"`
	DeleteAction string `json:"deleteAction"`
}

type Policy struct {
	Action   string `json:"action"`
	Resource string `json:"resource"`
	Allow    *Rule  `json:"allow,omitempty"`
	Deny     *Rule  `json:"deny,omitempty"`
}

type definition[T any] struct {
	Owner string `json:"owner"`
	Value T      `json:"value"`
}

type Contract interface {
	Type(string) error
}

type Registry struct {
	contract      Contract
	phase         uint8
	relationships map[string]definition[RelationshipDefinition]
	policies      map[string]definition[Policy]
	actions       map[string]definition[string]
	permissions   map[string]definition[Permission]
	groups        map[string]definition[GroupDefinition]
	fingerprint   string
}

func NewRegistry(contract Contract) *Registry {
	return &Registry{contract: contract, relationships: map[string]definition[RelationshipDefinition]{}, policies: map[string]definition[Policy]{}, actions: map[string]definition[string]{}, permissions: map[string]definition[Permission]{}, groups: map[string]definition[GroupDefinition]{}}
}

func (r *Registry) Initialize(emit func() error) error {
	if r.phase != 0 {
		return fmt.Errorf("security initialization already attempted")
	}
	r.phase = 1
	defer func() { r.phase = 2 }()
	if r.contract == nil {
		return fmt.Errorf("security contract is required")
	}
	if err := emit(); err != nil {
		return err
	}
	if err := r.validateTypes(); err != nil {
		return err
	}
	validate := func(owner, name, resource, action string) error {
		if _, ok := r.actions[resource+"/"+action]; !ok {
			return fmt.Errorf("module %s definition %s: unregistered action %s on %s", owner, name, action, resource)
		}
		return nil
	}
	for name, p := range r.policies {
		if err := validate(p.Owner, name, p.Value.Resource, p.Value.Action); err != nil {
			return err
		}
		for _, rule := range []*Rule{p.Value.Allow, p.Value.Deny} {
			if rule == nil {
				continue
			}
			for _, relation := range ruleRelationships(*rule) {
				if _, ok := r.relationships[relation]; !ok {
					return fmt.Errorf("module %s definition %s: unregistered relationship %s", p.Owner, name, relation)
				}
			}
		}
	}
	for name, p := range r.permissions {
		if p.Value.Configurable {
			if err := validate(p.Owner, name, p.Value.Resource, p.Value.ManageAction); err != nil {
				return err
			}
		}
	}
	for name, d := range r.relationships {
		for _, action := range []string{d.Value.AddAction, d.Value.RemoveAction} {
			if err := validate(d.Owner, name, d.Value.Object, action); err != nil {
				return err
			}
		}
		if d.Value.Membership {
			if _, ok := r.groups[d.Value.Object]; !ok {
				return fmt.Errorf("module %s definition %s: membership object must be a registered group type", d.Owner, name)
			}
		}
	}
	for name, d := range r.groups {
		for _, action := range []string{d.Value.CreateAction, d.Value.DeleteAction} {
			if err := validate(d.Owner, name, name, action); err != nil {
				return err
			}
		}
	}
	payload, err := json.Marshal(struct {
		Relationships map[string]definition[RelationshipDefinition] `json:"relationships"`
		Policies      map[string]definition[Policy]                 `json:"policies"`
		Actions       map[string]definition[string]                 `json:"actions"`
		Permissions   map[string]definition[Permission]             `json:"permissions"`
		Groups        map[string]definition[GroupDefinition]        `json:"groups"`
	}{r.relationships, r.policies, r.actions, r.permissions, r.groups})
	if err != nil {
		return err
	}
	sum := sha256.Sum256(payload)
	r.fingerprint = hex.EncodeToString(sum[:])
	return nil
}

func (r *Registry) check(owner, name string) error {
	if r.phase != 1 {
		return fmt.Errorf("module %s definition %s: security registration is closed", owner, name)
	}
	if owner == "" || !ident.Valid(name) {
		return fmt.Errorf("module %s definition %s: invalid or empty identifier", owner, name)
	}
	return nil
}

func (r *Registry) RegisterAction(owner, resource, action string) error {
	if err := r.check(owner, action); err != nil {
		return err
	}
	key := resource + "/" + action
	if _, ok := r.actions[key]; !ok {
		r.actions[key] = definition[string]{owner, action}
	}
	return nil
}

func (r *Registry) RegisterPermission(owner, name string, p Permission) error {
	if err := r.check(owner, name); err != nil {
		return err
	}
	if _, ok := r.permissions[name]; ok {
		return fmt.Errorf("module %s definition %s: duplicate permission", owner, name)
	}
	if p.Configurable && (!p.TypeScope && !p.InstanceScope || p.ManageAction == "") {
		return fmt.Errorf("module %s permission %s requires valid scopes and management action", owner, name)
	}
	if err := r.RegisterAction(owner, p.Resource, p.Action); err != nil {
		return err
	}
	r.permissions[name] = definition[Permission]{owner, p}
	return nil
}

func (r *Registry) RegisterGroup(owner, name string, d GroupDefinition) error {
	if err := r.check(owner, name); err != nil {
		return err
	}
	host := owner
	if index := strings.LastIndex(owner, "."); index >= 0 {
		host = owner[:index]
	}
	if !strings.Contains(name, ".") {
		name = host + "." + name
	}
	if short, found := strings.CutPrefix(name, host+"."); !found || !ident.JavaScript(short) {
		return fmt.Errorf("module %s group type %s must be a JavaScript identifier in host %s", owner, name, host)
	}
	if _, ok := r.groups[name]; ok {
		return fmt.Errorf("module %s definition %s: duplicate group type", owner, name)
	}
	r.groups[name] = definition[GroupDefinition]{owner, d}
	return nil
}

func (r *Registry) RegisterRelationship(owner, name string, d RelationshipDefinition) error {
	if err := r.check(owner, name); err != nil {
		return err
	}
	if _, ok := r.relationships[name]; ok {
		return fmt.Errorf("module %s definition %s: duplicate relationship", owner, name)
	}
	r.relationships[name] = definition[RelationshipDefinition]{owner, d}
	return nil
}

func (r *Registry) RegisterPolicy(owner, name string, p Policy) error {
	if err := r.check(owner, name); err != nil {
		return err
	}
	if _, ok := r.policies[name]; ok {
		return fmt.Errorf("module %s definition %s: duplicate policy", owner, name)
	}
	if p.Allow == nil && p.Deny == nil {
		return fmt.Errorf("module %s definition %s: policy needs allow or deny", owner, name)
	}
	for _, rule := range []*Rule{p.Allow, p.Deny} {
		if rule == nil {
			continue
		}
		if err := validateRule(*rule, 0); err != nil {
			return fmt.Errorf("module %s definition %s: %w", owner, name, err)
		}
	}
	data, err := json.Marshal(p)
	if err != nil {
		return fmt.Errorf("module %s definition %s: %w", owner, name, err)
	}
	var copied Policy
	if err := json.Unmarshal(data, &copied); err != nil {
		return fmt.Errorf("module %s definition %s: %w", owner, name, err)
	}
	r.policies[name] = definition[Policy]{owner, copied}
	return nil
}

func (r *Registry) Fingerprint() (string, error) {
	if r.fingerprint == "" {
		return "", fmt.Errorf("security registry is not finalized")
	}
	return r.fingerprint, nil
}

func (r *Registry) Relationship(name string) (RelationshipDefinition, error) {
	if _, err := r.Fingerprint(); err != nil {
		return RelationshipDefinition{}, err
	}
	d, ok := r.relationships[name]
	if !ok {
		return RelationshipDefinition{}, fmt.Errorf("unknown relationship %q", name)
	}
	return d.Value, nil
}

func (r *Registry) matching(resource, action string) []definition[Policy] {
	names := []string{}
	for name, p := range r.policies {
		if r.isA(resource, p.Value.Resource) && p.Value.Action == action {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	out := make([]definition[Policy], 0, len(names))
	for _, name := range names {
		out = append(out, r.policies[name])
	}
	return out
}

func (r *Registry) isA(actual, expected string) bool {
	if actual == expected {
		return true
	}
	if contract, ok := r.contract.(interface{ IsA(string, string) bool }); ok {
		return contract.IsA(actual, expected)
	}
	return false
}

const UserType = "easel.easel.User"

func (r *Registry) knownType(name string) error {
	if name == UserType {
		return nil
	}
	if _, ok := r.groups[name]; ok {
		return nil
	}
	return r.contract.Type(name)
}

func (r *Registry) validateTypes() error {
	for name, d := range r.groups {
		if name == UserType || r.contract.Type(name) == nil {
			return fmt.Errorf("module %s group type %s conflicts with an existing type", d.Owner, name)
		}
	}
	for key, d := range r.actions {
		resource, _, _ := strings.Cut(key, "/")
		if err := r.knownType(resource); err != nil {
			return fmt.Errorf("module %s action %s: %w", d.Owner, d.Value, err)
		}
	}
	for name, d := range r.relationships {
		for _, t := range []string{d.Value.Subject, d.Value.Object} {
			if err := r.knownType(t); err != nil {
				return fmt.Errorf("module %s definition %s: %w", d.Owner, name, err)
			}
		}
	}
	for name, p := range r.policies {
		if err := r.knownType(p.Value.Resource); err != nil {
			return fmt.Errorf("module %s definition %s: %w", p.Owner, name, err)
		}
	}
	for name, p := range r.permissions {
		if err := r.knownType(p.Value.Resource); err != nil {
			return fmt.Errorf("module %s definition %s: %w", p.Owner, name, err)
		}
	}
	return nil
}
