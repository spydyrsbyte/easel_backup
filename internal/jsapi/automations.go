package jsapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"easel/internal/automation"
	"easel/internal/events"
	"easel/internal/security"
	"github.com/grafana/sobek"
)

var errAutomationsNotConfigured = errors.New("game automation service is not configured")

func (bridge *EventBridge) InstallAutomations(service *automation.Service) error {
	if bridge.security != nil && service != nil {
		switch service.Access.(type) {
		case automation.AllowAllStub, *automation.AllowAllStub:
			return errors.New("security-enabled games cannot use automation.AllowAllStub")
		}
	}
	bridge.automations = service
	bridge.automationListeners = map[string]func(){}
	object := bridge.vm.NewObject()
	methods := map[string]func(sobek.FunctionCall) sobek.Value{
		"define": bridge.defineAutomation, "parse": bridge.parseAutomations, "run": bridge.runAutomation, "command": bridge.automationCommand,
		"get": bridge.getAutomation, "list": bridge.listAutomations, "remove": bridge.removeAutomation,
	}
	for name, method := range methods {
		if err := object.DefineDataProperty(name, bridge.vm.ToValue(method), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
			return err
		}
	}
	return bridge.vm.Get("Application").ToObject(bridge.vm).DefineDataProperty("automations", object, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE)
}

func (bridge *EventBridge) requireAutomations() {
	if bridge.automations == nil {
		bridge.fail(errAutomationsNotConfigured)
	}
	if bridge.ctx == nil {
		bridge.fail(fmt.Errorf("missing automation execution context"))
	}
}

func (bridge *EventBridge) defineAutomation(call sobek.FunctionCall) sobek.Value {
	bridge.requireAutomations()
	var definition automation.Definition
	if err := automation.Decode(bridge.encode(call.Argument(0)), &definition); err != nil {
		bridge.fail(err)
	}
	creator := automation.Creator{Kind: automation.CreatorSystem, ID: bridge.owner}
	if principal := security.Principal(bridge.ctx); principal != "" {
		creator = automation.Creator{Kind: automation.CreatorUser, ID: principal}
	}
	if err := bridge.SaveAutomation(bridge.ctx, creator, definition); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) parseAutomations(call sobek.FunctionCall) sobek.Value {
	text, ok := call.Argument(0).Export().(string)
	if !ok {
		bridge.fail(fmt.Errorf("parse requires source text"))
	}
	definitions, err := automation.Parse(text)
	if err != nil {
		bridge.fail(err)
	}
	return bridge.toJavaScript(definitions)
}

func (bridge *EventBridge) runAutomation(call sobek.FunctionCall) sobek.Value {
	bridge.requireAutomations()
	name := bridge.name(call.Argument(0))
	var arguments []any
	if !sobek.IsUndefined(call.Argument(1)) {
		if err := automation.Decode(bridge.encode(call.Argument(1)), &arguments); err != nil {
			bridge.fail(fmt.Errorf("automation arguments must be a list: %w", err))
		}
	}
	result, err := bridge.RunAutomation(bridge.ctx, name, arguments)
	if err != nil {
		bridge.fail(err)
	}
	return bridge.toJavaScript(result.Value)
}

func (bridge *EventBridge) automationCommand(call sobek.FunctionCall) sobek.Value {
	bridge.requireAutomations()
	command, ok := call.Argument(0).Export().(string)
	if !ok {
		bridge.fail(fmt.Errorf("command requires text"))
	}
	result, err := bridge.RunCommand(bridge.ctx, command)
	if err != nil {
		bridge.fail(err)
	}
	return bridge.toJavaScript(result.Value)
}
func (bridge *EventBridge) getAutomation(call sobek.FunctionCall) sobek.Value {
	bridge.requireAutomations()
	saved, err := bridge.automations.Load(bridge.ctx, bridge.name(call.Argument(0)))
	if err != nil {
		bridge.fail(err)
	}
	return bridge.toJavaScript(saved)
}
func (bridge *EventBridge) listAutomations(sobek.FunctionCall) sobek.Value {
	bridge.requireAutomations()
	saved, err := bridge.ListAutomations(bridge.ctx)
	if err != nil {
		bridge.fail(err)
	}
	return bridge.toJavaScript(saved)
}
func (bridge *EventBridge) removeAutomation(call sobek.FunctionCall) sobek.Value {
	bridge.requireAutomations()
	name := bridge.name(call.Argument(0))
	if err := bridge.DeleteAutomation(bridge.ctx, name); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) toJavaScript(value any) sobek.Value {
	data, err := json.Marshal(value)
	if err != nil {
		bridge.fail(err)
	}
	result, err := bridge.parse(sobek.Undefined(), bridge.vm.ToValue(string(data)))
	if err != nil {
		bridge.fail(err)
	}
	return result
}

func (bridge *EventBridge) RunAutomation(ctx context.Context, name string, args []any) (automation.Result, error) {
	if bridge.automations == nil {
		return automation.Result{}, errAutomationsNotConfigured
	}
	ctx, err := bridge.withTransaction(ctx)
	if err != nil {
		return automation.Result{}, err
	}
	result, err := bridge.automations.Run(automationEnvironment(ctx), name, args)
	if err != nil {
		return automation.Result{}, err
	}
	return result, bridge.deliverAutomationEvents(ctx, result)
}

func (bridge *EventBridge) RunCommand(ctx context.Context, command string) (automation.Result, error) {
	if bridge.automations == nil {
		return automation.Result{}, errAutomationsNotConfigured
	}
	ctx, err := bridge.withTransaction(ctx)
	if err != nil {
		return automation.Result{}, err
	}
	result, err := bridge.automations.Command(automationEnvironment(ctx), command)
	if err != nil {
		return automation.Result{}, err
	}
	return result, bridge.deliverAutomationEvents(ctx, result)
}

func automationEnvironment(ctx context.Context) context.Context {
	execution := security.Execution(ctx)
	return automation.WithEnvironment(ctx, map[string]any{"principal": security.Principal(ctx), "game": execution.GameID, "session": execution.SessionID, "origin": execution.Origin})
}

func (bridge *EventBridge) SaveAutomation(ctx context.Context, creator automation.Creator, definition automation.Definition) error {
	if bridge.automations == nil {
		return errAutomationsNotConfigured
	}
	if err := bridge.checkAutomationEvent(definition); err != nil {
		return err
	}
	if err := bridge.automations.Save(ctx, creator, definition); err != nil {
		return err
	}
	return bridge.BindAutomation(ctx, definition)
}
func (bridge *EventBridge) ListAutomations(ctx context.Context) ([]automation.Saved, error) {
	if bridge.automations == nil {
		return nil, errAutomationsNotConfigured
	}
	return bridge.automations.List(ctx)
}
func (bridge *EventBridge) DeleteAutomation(ctx context.Context, name string) error {
	if bridge.automations == nil {
		return errAutomationsNotConfigured
	}
	if err := bridge.automations.Delete(ctx, name); err != nil {
		return err
	}
	if cancel := bridge.automationListeners[name]; cancel != nil {
		cancel()
		delete(bridge.automationListeners, name)
	}
	return nil
}

func (bridge *EventBridge) deliverAutomationEvents(ctx context.Context, result automation.Result) error {
	for _, event := range result.Events {
		payload, err := json.Marshal(event.Payload)
		if err != nil {
			return err
		}
		if err := bridge.engine.Emit(ctx, events.Automation, event.Name, payload); err != nil {
			return fmt.Errorf("%w: event %q: %w", automation.ErrPostCommit, event.Name, err)
		}
	}
	return nil
}

func (bridge *EventBridge) checkAutomationEvent(definition automation.Definition) error {
	if definition.Event == "" {
		return nil
	}
	return bridge.engine.CheckSubscription(definition.Event, definition.Parameters)
}

func (bridge *EventBridge) BindAutomation(ctx context.Context, definition automation.Definition) error {
	if err := bridge.checkAutomationEvent(definition); err != nil {
		return err
	}
	if cancel := bridge.automationListeners[definition.Name]; cancel != nil {
		cancel()
		delete(bridge.automationListeners, definition.Name)
	}
	if definition.Event == "" {
		return nil
	}
	cancel, err := bridge.engine.Listen("automation:"+definition.Name, definition.Event, func(ctx context.Context, payload json.RawMessage) error {
		var values map[string]any
		if err := automation.Decode(payload, &values); err != nil {
			return err
		}
		arguments := make([]any, len(definition.Parameters))
		for index, name := range definition.Parameters {
			value, found := values[name]
			if !found {
				return fmt.Errorf("automation %s requires event field %q", definition.Name, name)
			}
			arguments[index] = value
		}
		_, err := bridge.RunAutomation(ctx, definition.Name, arguments)
		return err
	})
	if err != nil {
		return err
	}
	bridge.automationListeners[definition.Name] = cancel
	return nil
}
