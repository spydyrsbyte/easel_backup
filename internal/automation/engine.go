package automation

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"easel/internal/ident"
)

type Service struct {
	Definitions  Repository
	Records      Records
	Access       Access
	MaxSteps     int
	MaxCallDepth int
}

func New(repository Repository, records Records, access Access) *Service {
	return &Service{Definitions: repository, Records: records, Access: access, MaxSteps: defaultMaxSteps, MaxCallDepth: defaultMaxCallDepth}
}

func (service *Service) authorize(ctx context.Context, action string, saved Saved) error {
	if service.Access == nil {
		return fmt.Errorf("automation access policy missing; explicitly supply AllowAllStub during development")
	}
	return service.Access.Authorize(ctx, action, saved)
}

func (service *Service) authorizeWrite(ctx context.Context, action string, saved Saved) error {
	if guard, ok := service.Definitions.(WriteGuard); ok && guard.AuthorizesWrites() {
		return nil
	}
	return service.authorize(ctx, action, saved)
}

func (service *Service) Save(ctx context.Context, creator Creator, definition Definition) error {
	if err := Validate(definition); err != nil {
		return err
	}
	if service.Definitions == nil {
		return fmt.Errorf("automation repository is not configured")
	}
	saved := Saved{definition, creator}
	existing, err := service.Definitions.Load(ctx, definition.Name)
	if err == nil {
		if existing.Creator != creator {
			return fmt.Errorf("automation %q already belongs to another creator", definition.Name)
		}
	} else if !errors.Is(err, ErrNotFound) {
		return err
	}
	if err := service.authorizeWrite(ctx, "save", saved); err != nil {
		return err
	}
	return service.Definitions.Save(ctx, saved)
}

func (service *Service) Load(ctx context.Context, name string) (Saved, error) {
	if service.Definitions == nil {
		return Saved{}, fmt.Errorf("automation repository is not configured")
	}
	saved, err := service.Definitions.Load(ctx, name)
	if err != nil {
		return Saved{}, err
	}
	if err := service.authorize(ctx, "read", saved); err != nil {
		return Saved{}, err
	}
	return saved, nil
}

func (service *Service) List(ctx context.Context) ([]Saved, error) {
	if service.Definitions == nil {
		return nil, fmt.Errorf("automation repository is not configured")
	}
	saved, err := service.Definitions.List(ctx)
	if err != nil {
		return nil, err
	}
	visible := []Saved{}
	for _, definition := range saved {
		err := service.authorize(ctx, "read", definition)
		if errors.Is(err, ErrDenied) {
			continue
		}
		if err != nil {
			return nil, err
		}
		visible = append(visible, definition)
	}
	return visible, nil
}

func (service *Service) Delete(ctx context.Context, name string) error {
	if service.Definitions == nil {
		return fmt.Errorf("automation repository is not configured")
	}
	saved, err := service.Definitions.Load(ctx, name)
	if err != nil {
		return err
	}
	if err := service.authorizeWrite(ctx, "delete", saved); err != nil {
		return err
	}
	return service.Definitions.Delete(ctx, name)
}

type execution struct {
	service     *Service
	ctx         context.Context
	transaction Transaction
	loaded      map[string]*Record
	staged      map[string]Record
	events      []Emission
	steps       int
	definitions map[string]Saved
}

type frame struct {
	environment map[string]any
	arguments   map[string]any
	variables   map[string]any
	records     map[string]*Record
}

type flow struct {
	returned bool
	value    any
}

func (service *Service) Run(ctx context.Context, name string, arguments []any) (Result, error) {
	if service.Definitions == nil {
		return Result{}, fmt.Errorf("automation repository is not configured")
	}
	execution := &execution{service: service, ctx: ctx, loaded: map[string]*Record{}, staged: map[string]Record{}, definitions: map[string]Saved{}}
	shared := SharedTransaction(ctx)
	execution.transaction = shared
	defer func() {
		if execution.transaction != nil && shared == nil {
			_ = execution.transaction.Rollback(context.Background())
		}
	}()
	value, err := execution.call(name, arguments, 0)
	if err != nil {
		return Result{}, err
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	if execution.transaction != nil {
		keys := make([]string, 0, len(execution.staged))
		for key := range execution.staged {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			if err := execution.transaction.Save(ctx, execution.staged[key]); err != nil {
				return Result{}, err
			}
		}
		if shared == nil {
			if err := execution.transaction.Commit(ctx); err != nil {
				return Result{}, err
			}
		}
		execution.transaction = nil
	}
	return Result{Value: value, Events: execution.events}, nil
}

func (execution *execution) call(name string, arguments []any, depth int) (any, error) {
	if err := execution.ctx.Err(); err != nil {
		return nil, err
	}
	limit := execution.service.maxCallDepth()
	if depth >= limit {
		return nil, fmt.Errorf("automation call depth exceeded")
	}
	saved, found := execution.definitions[name]
	if !found {
		var err error
		saved, err = execution.service.Definitions.Load(execution.ctx, name)
		if err != nil {
			return nil, err
		}
		execution.definitions[name] = saved
	}
	if err := execution.service.authorize(execution.ctx, "run", saved); err != nil {
		return nil, err
	}
	if len(arguments) != len(saved.Definition.Parameters) {
		return nil, fmt.Errorf("%s expects %d arguments, got %d", name, len(saved.Definition.Parameters), len(arguments))
	}
	frame := &frame{arguments: map[string]any{}, variables: map[string]any{}, records: map[string]*Record{}}
	frame.environment, _ = execution.ctx.Value(environmentKey{}).(map[string]any)
	for index, parameter := range saved.Definition.Parameters {
		value, err := clone(arguments[index])
		if err != nil {
			return nil, err
		}
		frame.arguments[parameter] = value
	}
	result, err := execution.runSteps(frame, saved.Definition.Steps, depth)
	if err != nil {
		return nil, fmt.Errorf("automation %s: %w", name, err)
	}
	return clone(result.value)
}

func (execution *execution) runSteps(frame *frame, steps []Step, depth int) (flow, error) {
	for index := 0; index < len(steps); index++ {
		if err := execution.ctx.Err(); err != nil {
			return flow{}, err
		}
		execution.steps++
		limit := execution.service.maxSteps()
		if execution.steps > limit {
			return flow{}, fmt.Errorf("automation instruction limit exceeded")
		}
		step := steps[index]
		result, skip, err := execution.step(frame, step, depth)
		if err != nil {
			return flow{}, fmt.Errorf("step %d (%s): %w", index+1, step.Op, err)
		}
		if result.returned {
			return result, nil
		}
		if skip {
			index++
		}
	}
	return flow{}, nil
}

func (execution *execution) step(frame *frame, step Step, depth int) (flow, bool, error) {
	evaluate := func(value any) (any, error) { return frame.evaluate(value) }
	var err error
	switch step.Op {
	case "fields":
		for _, name := range step.Names {
			if !ident.Valid(name) {
				return flow{}, false, fmt.Errorf("invalid variable %q", name)
			}
			if _, exists := frame.variables[name]; !exists {
				frame.variables[name] = nil
			}
		}
	case "let":
		if !ident.Valid(step.Name) {
			return flow{}, false, fmt.Errorf("invalid variable name")
		}
		if frame.records[step.Name] != nil {
			return flow{}, false, fmt.Errorf("cannot replace a loaded record alias")
		}
		frame.variables[step.Name], err = evaluate(step.Value)
	case "load":
		if !ident.Valid(step.As) {
			return flow{}, false, fmt.Errorf("load requires an alias")
		}
		var id any
		id, err = evaluate(step.ID)
		if err != nil {
			break
		}
		idString := fmt.Sprint(id)
		if id == nil || step.Type == "" {
			return flow{}, false, fmt.Errorf("load requires record type and ID")
		}
		if execution.transaction == nil {
			if execution.service.Records == nil {
				return flow{}, false, fmt.Errorf("game record service is not configured")
			}
			execution.transaction, err = execution.service.Records.Begin(execution.ctx)
			if err != nil {
				break
			}
		}
		key := step.Type + "\x00" + idString
		record := execution.loaded[key]
		if record == nil {
			var loaded Record
			loaded, err = execution.transaction.Load(execution.ctx, step.Type, idString)
			if err != nil {
				break
			}
			record = &loaded
			execution.loaded[key] = record
		}
		frame.records[step.As] = record
		frame.variables[step.As] = record.Data
	case "save":
		record := frame.records[step.Record]
		if record == nil {
			return flow{}, false, fmt.Errorf("%q is not a loaded record", step.Record)
		}
		var copied any
		copied, err = clone(record.Data)
		if err != nil {
			break
		}
		snapshot := *record
		snapshot.Data = copied.(map[string]any)
		execution.staged[record.Type+"\x00"+record.ID] = snapshot
	case "set", "delta", "multiply", "append", "remove":
		var value any
		value, err = evaluate(step.Value)
		if err != nil {
			break
		}
		if step.Op != "set" {
			var current any
			current, err = evaluate(step.Target)
			if err != nil {
				break
			}
			switch step.Op {
			case "delta":
				value, err = arithmetic("add", current, value)
			case "multiply":
				value, err = arithmetic("multiply", current, value)
			case "append":
				list, ok := current.([]any)
				if !ok {
					return flow{}, false, fmt.Errorf("append target must be a list")
				}
				value = append(append([]any(nil), list...), value)
			case "remove":
				list, ok := current.([]any)
				if !ok {
					return flow{}, false, fmt.Errorf("remove target must be a list")
				}
				var position int
				position, err = listIndex(value, len(list))
				if err == nil {
					value = append(append([]any(nil), list[:position]...), list[position+1:]...)
				}
			}
		}
		if err == nil {
			err = frame.assign(step.Target, value)
		}
	case "compare", "check", "if":
		var condition any
		condition, err = evaluate(step.Condition)
		if err != nil {
			break
		}
		truth, ok := condition.(bool)
		if !ok {
			return flow{}, false, fmt.Errorf("condition must be boolean")
		}
		if step.Op == "compare" {
			return flow{}, !truth, nil
		}
		if step.Op == "check" && !truth {
			return flow{}, false, fmt.Errorf("check failed: %s", step.Message)
		}
		if step.Op == "if" {
			selected := step.Else
			if truth {
				selected = step.Then
			}
			result, err := execution.runSteps(frame, selected, depth)
			return result, false, err
		}
	case "block":
		result, err := execution.runSteps(frame, step.Steps, depth)
		return result, false, err
	case "each":
		var value any
		value, err = evaluate(step.Value)
		if err != nil {
			break
		}
		list, ok := value.([]any)
		if !ok {
			return flow{}, false, fmt.Errorf("each requires a list")
		}
		if !ident.Valid(step.Item) || frame.records[step.Item] != nil || (step.Index != "" && (!ident.Valid(step.Index) || frame.records[step.Index] != nil || step.Index == step.Item)) {
			return flow{}, false, fmt.Errorf("invalid loop variable")
		}
		previous, existed := frame.variables[step.Item]
		previousIndex, indexExisted := frame.variables[step.Index]
		defer func() {
			if existed {
				frame.variables[step.Item] = previous
			} else {
				delete(frame.variables, step.Item)
			}
			if step.Index != "" {
				if indexExisted {
					frame.variables[step.Index] = previousIndex
				} else {
					delete(frame.variables, step.Index)
				}
			}
		}()
		for index, item := range list {
			if err := execution.ctx.Err(); err != nil {
				return flow{}, false, err
			}
			frame.variables[step.Item] = item
			if step.Index != "" {
				frame.variables[step.Index] = index
			}
			result, err := execution.runSteps(frame, step.Steps, depth)
			if err != nil || result.returned {
				return result, false, err
			}
		}
	case "call":
		arguments := make([]any, len(step.Args))
		for index, argument := range step.Args {
			arguments[index], err = evaluate(argument)
			if err != nil {
				break
			}
		}
		if err == nil {
			var value any
			value, err = execution.call(step.Name, arguments, depth+1)
			if err == nil && step.As != "" {
				if frame.records[step.As] != nil {
					return flow{}, false, fmt.Errorf("cannot overwrite record alias")
				}
				frame.variables[step.As] = value
			}
		}
	case "emit":
		var value any
		value, err = evaluate(step.Value)
		if err != nil {
			break
		}
		payload, ok := value.(map[string]any)
		if !ok {
			return flow{}, false, fmt.Errorf("event payload must be an object")
		}
		var copied any
		copied, err = clone(payload)
		if err == nil {
			execution.events = append(execution.events, Emission{step.Name, copied.(map[string]any)})
		}
	case "return":
		value, err := evaluate(step.Value)
		return flow{returned: true, value: value}, false, err
	default:
		err = fmt.Errorf("unknown operation %q", step.Op)
	}
	return flow{}, false, err
}
