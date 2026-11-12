package events

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"sort"
	"strings"
)

type Origin uint8

const (
	Server     Origin = 1
	Client     Origin = 2
	Automation Origin = 4
)

func (origin Origin) String() string {
	switch origin {
	case Server:
		return "server"
	case Client:
		return "client"
	case Automation:
		return "automation"
	}
	return ""
}

type Types interface {
	Resolve(typeName string) error
	Validate(context.Context, string, json.RawMessage) error
}

type Definition struct {
	Valid  Origin
	Fields map[string]string
}

type Handler func(context.Context, json.RawMessage) error

type registration struct {
	definition Definition
	owner      string
	listeners  []listener
}

type listener struct {
	owner   string
	state   *listenerState
	handler Handler
}

type listenerState struct {
	active bool
}
type emission struct {
	name    string
	payload json.RawMessage
}

type Engine struct {
	types       Types
	registry    map[string]*registration
	queue       []emission
	dispatching bool
	loading     bool
	initialized map[string]bool
}

func New(types Types) *Engine {
	return &Engine{types: types, registry: make(map[string]*registration), loading: true, initialized: map[string]bool{}}
}

func (engine *Engine) FinishLoading() { engine.loading = false }

func (engine *Engine) InitializeEvent(ctx context.Context, name string) error {
	if !engine.loading {
		return fmt.Errorf("initialization is closed")
	}
	if engine.initialized[name] {
		return fmt.Errorf("initialization event %q already dispatched", name)
	}
	entry, ok := engine.registry[name]
	if !ok {
		return fmt.Errorf("unknown initialization event %q", name)
	}
	engine.initialized[name] = true
	listeners := append([]listener(nil), entry.listeners...)
	for _, subscriber := range listeners {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := subscriber.handler(ctx, json.RawMessage(`{}`)); err != nil {
			return fmt.Errorf("initialization %s module %s: %w", name, subscriber.owner, err)
		}
	}
	return nil
}

func (engine *Engine) CheckSubscription(name string, parameters []string) error {
	entry, found := engine.registry[name]
	if !found {
		return fmt.Errorf("unknown event %q", name)
	}
	for _, parameter := range parameters {
		if _, found := entry.definition.Fields[parameter]; !found {
			return fmt.Errorf("event %q has no field %q", name, parameter)
		}
	}
	return nil
}

func (engine *Engine) Register(owner, name string, definition Definition) error {
	if !engine.loading {
		return fmt.Errorf("events may only be registered while loading")
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("event name is empty")
	}
	if existing, found := engine.registry[name]; found {
		return fmt.Errorf("event %q already registered by %s (duplicate from %s)", name, existing.owner, owner)
	}
	if definition.Valid == 0 || definition.Valid & ^(Server|Client|Automation) != 0 {
		return fmt.Errorf("event %q has invalid origin mask", name)
	}
	fields := make(map[string]string, len(definition.Fields))
	for _, field := range sortedKeys(definition.Fields) {
		typeName := definition.Fields[field]
		if field == "" || field == "valid" {
			return fmt.Errorf("event %q has invalid field %q", name, field)
		}
		if !builtin(typeName) {
			if engine.types == nil {
				return fmt.Errorf("event %q field %q: no effective-type resolver for %q", name, field, typeName)
			}
			if err := engine.types.Resolve(typeName); err != nil {
				return fmt.Errorf("event %q field %q: %w", name, field, err)
			}
		}
		fields[field] = typeName
	}
	engine.registry[name] = &registration{definition: Definition{definition.Valid, fields}, owner: owner}
	return nil
}

func (engine *Engine) On(owner, name string, handler Handler) error {
	if !engine.loading {
		return fmt.Errorf("listeners may only be registered while loading")
	}
	_, err := engine.Listen(owner, name, handler)
	return err
}

func (engine *Engine) Listen(owner, name string, handler Handler) (func(), error) {
	entry, found := engine.registry[name]
	if !found {
		return nil, fmt.Errorf("listener from %s references unknown event %q", owner, name)
	}
	if handler == nil {
		return nil, fmt.Errorf("event %q has nil handler", name)
	}
	state := &listenerState{active: true}
	retained := make([]listener, 0, len(entry.listeners)+1)
	for _, existing := range entry.listeners {
		if existing.state.active {
			retained = append(retained, existing)
		}
	}
	entry.listeners = append(retained, listener{owner: owner, state: state, handler: func(ctx context.Context, payload json.RawMessage) error {
		if !state.active {
			return nil
		}
		return handler(ctx, payload)
	}})
	return func() { state.active = false }, nil
}

func (engine *Engine) Emit(ctx context.Context, origin Origin, name string, payload json.RawMessage) error {
	if err := engine.Check(ctx, origin, name, payload); err != nil {
		return err
	}
	engine.queue = append(engine.queue, emission{name, append(json.RawMessage(nil), payload...)})
	if engine.dispatching {
		return nil
	}
	engine.dispatching = true
	defer func() { engine.dispatching = false; engine.queue = nil }()
	for len(engine.queue) > 0 {
		if err := ctx.Err(); err != nil {
			return err
		}
		current := engine.queue[0]
		engine.queue[0] = emission{}
		engine.queue = engine.queue[1:]
		for _, subscriber := range engine.registry[current.name].listeners {
			if err := ctx.Err(); err != nil {
				return err
			}
			if err := subscriber.handler(ctx, append(json.RawMessage(nil), current.payload...)); err != nil {
				return fmt.Errorf("event %q handler from %s: %w", current.name, subscriber.owner, err)
			}
		}
	}
	return nil
}

func (engine *Engine) Check(ctx context.Context, origin Origin, name string, payload json.RawMessage) error {
	if engine.initialized[name] {
		return fmt.Errorf("initialization event %q cannot be emitted during execution", name)
	}
	if engine.loading {
		return fmt.Errorf("events cannot be emitted before loading finishes")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if origin != Server && origin != Client && origin != Automation {
		return fmt.Errorf("invalid emitting origin")
	}
	entry, found := engine.registry[name]
	if !found {
		return fmt.Errorf("unknown event %q", name)
	}
	if entry.definition.Valid&origin == 0 {
		return fmt.Errorf("event %q rejects origin %s", name, origin)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return fmt.Errorf("event %q payload must be a JSON object", name)
	}
	for _, field := range sortedKeys(fields) {
		if _, found := entry.definition.Fields[field]; !found {
			return fmt.Errorf("event %q has undeclared field %q", name, field)
		}
	}
	for _, field := range sortedKeys(entry.definition.Fields) {
		value, found := fields[field]
		if !found {
			return fmt.Errorf("event %q is missing field %q", name, field)
		}
		typeName := entry.definition.Fields[field]
		if err := engine.validate(ctx, typeName, value); err != nil {
			return fmt.Errorf("event %q field %q: %w", name, field, err)
		}
	}
	return nil
}

func builtin(name string) bool {
	switch name {
	case "string", "boolean", "number", "integer", "field", "array", "null":
		return true
	}
	return false
}

func (engine *Engine) validate(ctx context.Context, name string, value json.RawMessage) error {
	var decoded any
	if err := json.Unmarshal(value, &decoded); err != nil {
		return err
	}
	valid := false
	switch name {
	case "string":
		_, valid = decoded.(string)
	case "boolean":
		_, valid = decoded.(bool)
	case "number":
		_, valid = decoded.(float64)
	case "integer":
		if _, numeric := decoded.(float64); numeric {
			precise, ok := new(big.Rat).SetString(string(value))
			valid = ok && precise.IsInt()
		}
	case "field":
		_, valid = decoded.(map[string]any)
	case "array":
		_, valid = decoded.([]any)
	case "null":
		valid = decoded == nil
	default:
		return engine.types.Validate(ctx, name, value)
	}
	if !valid {
		return fmt.Errorf("expected %s", name)
	}
	return nil
}

func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
