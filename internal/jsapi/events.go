package jsapi

import (
	"context"
	"encoding/json"
	"fmt"

	"easel/internal/automation"
	"easel/internal/events"
	"easel/internal/security"
	"github.com/grafana/sobek"
)

type EventBridge struct {
	security             *security.SecurityService
	vm                   *sobek.Runtime
	engine               *events.Engine
	parse                sobek.Callable
	stringify            sobek.Callable
	ctx                  context.Context
	origin               events.Origin
	owner                string
	automations          *automation.Service
	automationListeners  map[string]func()
	interfaces           *sobek.Object
	implementations      map[string][]*implementation
	modules              *ModuleLoader
	interfaceGrants      map[string]interfaceGrant
	records              *recordState
	authHooks            map[string][]sobek.Callable
	connectionHooks      map[string][]sobek.Callable
	games                ServerGames
	users                ServerUsers
	deliveries           []func() error
	requestEffects       []func(bool)
	gameID               string
	emitServerEvent      func(ctx context.Context, gameID string, eventName string, payload json.RawMessage) error
	serverEventListeners map[string][]sobek.Callable
	serverGameListeners  map[string][]sobek.Callable
	submit               func(context.Context, events.Origin, string, func() (json.RawMessage, error)) (json.RawMessage, error)
}

func newBridge(vm *sobek.Runtime) *EventBridge {
	jsonObject := vm.Get("JSON").ToObject(vm)
	parse, _ := sobek.AssertFunction(jsonObject.Get("parse"))
	stringify, _ := sobek.AssertFunction(jsonObject.Get("stringify"))
	return &EventBridge{
		vm:                   vm,
		parse:                parse,
		stringify:            stringify,
		serverEventListeners: make(map[string][]sobek.Callable),
		serverGameListeners:  make(map[string][]sobek.Callable),
	}
}

func InstallEvents(vm *sobek.Runtime, engine *events.Engine) (*EventBridge, error) {
	bridge := newBridge(vm)
	bridge.modules = NewModuleLoader(vm)
	bridge.engine = engine
	eventObject := vm.NewObject()
	for name, method := range map[string]func(sobek.FunctionCall) sobek.Value{
		"register": bridge.register, "on": bridge.on, "emit": bridge.emit,
	} {
		if err := eventObject.DefineDataProperty(name, vm.ToValue(method), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
			return nil, err
		}
	}
	application := vm.NewObject()
	if err := application.DefineDataProperty("events", eventObject, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return nil, err
	}
	if err := vm.GlobalObject().DefineDataProperty("Application", application, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return nil, err
	}
	serverEvents := vm.NewObject()
	if err := serverEvents.DefineDataProperty("on", vm.ToValue(bridge.onServerEvent), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return nil, err
	}
	if err := serverEvents.DefineDataProperty("emit", vm.ToValue(bridge.emitToServer), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return nil, err
	}
	server := vm.NewObject()
	if err := server.DefineDataProperty("events", serverEvents, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return nil, err
	}
	if err := vm.GlobalObject().DefineDataProperty("Server", server, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return nil, err
	}
	if err := bridge.installEasel(); err != nil {
		return nil, err
	}
	return bridge, nil
}

func (bridge *EventBridge) SetSubmit(submit func(context.Context, events.Origin, string, func() (json.RawMessage, error)) (json.RawMessage, error)) {
	bridge.submit = submit
}

func (bridge *EventBridge) SetServerEventEmitter(gameID string, emitter func(ctx context.Context, gameID string, eventName string, payload json.RawMessage) error) {
	bridge.gameID = gameID
	bridge.emitServerEvent = emitter
}

func (bridge *EventBridge) Within(ctx context.Context, origin events.Origin, owner string, execute func() error) error {
	previousContext, previousOrigin, previousOwner := bridge.ctx, bridge.origin, bridge.owner
	bridge.ctx, bridge.origin, bridge.owner = ctx, origin, owner
	defer func() { bridge.ctx, bridge.origin, bridge.owner = previousContext, previousOrigin, previousOwner }()
	return execute()
}

func (bridge *EventBridge) Context() context.Context { return bridge.ctx }

func (bridge *EventBridge) CallJSON(handler sobek.Callable, message json.RawMessage) (json.RawMessage, error) {
	value, err := bridge.parse(sobek.Undefined(), bridge.vm.ToValue(string(message)))
	if err != nil {
		return nil, err
	}
	returned, err := handler(sobek.Undefined(), value)
	if err != nil {
		return nil, err
	}
	if _, asynchronous := returned.Export().(*sobek.Promise); asynchronous {
		return nil, fmt.Errorf("asynchronous message handlers are unsupported")
	}
	encoded, err := bridge.stringify(sobek.Undefined(), returned)
	if err != nil {
		return nil, err
	}
	if sobek.IsUndefined(encoded) {
		return nil, fmt.Errorf("handler must return JSON-serializable data")
	}
	return json.RawMessage(encoded.String()), nil
}

func (bridge *EventBridge) register(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	data := bridge.encode(call.Argument(1))
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil || fields == nil {
		bridge.fail(fmt.Errorf("event definition must be an object"))
	}
	var mask uint8
	if err := json.Unmarshal(fields["valid"], &mask); err != nil {
		bridge.fail(fmt.Errorf("event valid must be an integer origin mask"))
	}
	delete(fields, "valid")
	definition := events.Definition{Valid: events.Origin(mask), Fields: make(map[string]string)}
	for field, encoded := range fields {
		var typeName string
		if err := json.Unmarshal(encoded, &typeName); err != nil {
			bridge.fail(fmt.Errorf("event field %q must name a type", field))
		}
		definition.Fields[field] = typeName
	}
	if err := bridge.engine.Register(bridge.owner, name, definition); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) on(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	handler, ok := sobek.AssertFunction(call.Argument(1))
	if !ok {
		bridge.fail(fmt.Errorf("event handler must be a function"))
	}
	owner, origin := bridge.owner, bridge.origin
	err := bridge.engine.On(owner, name, func(ctx context.Context, payload json.RawMessage) error {
		return bridge.Within(ctx, origin, owner, func() error {
			value, err := bridge.parse(sobek.Undefined(), bridge.vm.ToValue(string(payload)))
			if err != nil {
				return err
			}
			arguments := []sobek.Value{value}
			if connection := ConnectionFrom(ctx); connection != nil {
				arguments = append(arguments, bridge.connectionObject(connection))
			}
			returned, err := handler(sobek.Undefined(), arguments...)
			if err != nil {
				return err
			}
			if _, asynchronous := returned.Export().(*sobek.Promise); asynchronous {
				return fmt.Errorf("asynchronous event handlers are unsupported")
			}
			return nil
		})
	})
	if err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) emit(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	payload := bridge.encode(call.Argument(1))
	if bridge.ctx == nil {
		bridge.fail(fmt.Errorf("missing trusted event execution context"))
	}
	if err := bridge.engine.Emit(bridge.ctx, bridge.origin, name, payload); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) encode(value sobek.Value) json.RawMessage {
	encoded, err := bridge.stringify(sobek.Undefined(), value)
	if err != nil {
		bridge.fail(err)
	}
	if sobek.IsUndefined(encoded) {
		bridge.fail(fmt.Errorf("event value must be JSON-serializable"))
	}
	return json.RawMessage(encoded.String())
}

func (bridge *EventBridge) name(value sobek.Value) string {
	name, ok := value.Export().(string)
	if !ok {
		bridge.fail(fmt.Errorf("event name must be a string"))
	}
	return name
}

func (bridge *EventBridge) fail(err error) { panic(bridge.vm.NewGoError(err)) }

func (bridge *EventBridge) onServerEvent(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	handler, ok := sobek.AssertFunction(call.Argument(1))
	if !ok {
		bridge.fail(fmt.Errorf("event handler must be a function"))
	}
	if bridge.serverEventListeners == nil {
		bridge.serverEventListeners = make(map[string][]sobek.Callable)
	}
	bridge.serverEventListeners[name] = append(bridge.serverEventListeners[name], handler)
	if bridge.engine != nil {
		owner, origin := bridge.owner, bridge.origin
		_ = bridge.engine.On(owner, name, func(ctx context.Context, payload json.RawMessage) error {
			return bridge.Within(ctx, origin, owner, func() error {
				value, err := bridge.parse(sobek.Undefined(), bridge.vm.ToValue(string(payload)))
				if err != nil {
					return err
				}
				arguments := []sobek.Value{value}
				if connection := ConnectionFrom(ctx); connection != nil {
					arguments = append(arguments, bridge.connectionObject(connection))
				}
				returned, err := handler(sobek.Undefined(), arguments...)
				if err != nil {
					return err
				}
				if _, asynchronous := returned.Export().(*sobek.Promise); asynchronous {
					return fmt.Errorf("asynchronous event handlers are unsupported")
				}
				return nil
			})
		})
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) emitToServer(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	var payload json.RawMessage
	if len(call.Arguments) > 1 && !sobek.IsUndefined(call.Argument(1)) {
		payload = bridge.encode(call.Argument(1))
	} else {
		payload = json.RawMessage(`{}`)
	}
	if bridge.emitServerEvent != nil {
		ctx := bridge.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		if err := bridge.emitServerEvent(ctx, bridge.gameID, name, payload); err != nil {
			bridge.fail(err)
		}
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) DeliverServerEvent(name string, payload json.RawMessage) error {
	handlers := bridge.serverEventListeners[name]
	if len(handlers) == 0 {
		return nil
	}
	var val sobek.Value = sobek.Undefined()
	if len(payload) > 0 {
		var err error
		val, err = bridge.parse(sobek.Undefined(), bridge.vm.ToValue(string(payload)))
		if err != nil {
			return fmt.Errorf("parse server event payload: %w", err)
		}
	}
	for _, handler := range handlers {
		returned, err := handler(sobek.Undefined(), val)
		if err != nil {
			return err
		}
		if _, asynchronous := returned.Export().(*sobek.Promise); asynchronous {
			return fmt.Errorf("asynchronous server event handlers are unsupported")
		}
	}
	return nil
}
