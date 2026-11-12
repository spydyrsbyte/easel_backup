package jsapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"easel/internal/manifest"
	"easel/internal/schema"
	"easel/internal/security"
	"github.com/grafana/sobek"
)

type SecurityConfig struct {
	Service *security.SecurityService
	Store   security.Store
	BuildID string
}

func BuildSecurity(ctx context.Context, config *SecurityConfig, sessionID string, entries []manifest.Entry, types *schema.Schema) (*security.SecurityService, error) {
	if config == nil {
		if len(entries) > 0 {
			return nil, fmt.Errorf("security files require a security configuration")
		}
		return nil, nil
	}
	if config.Store == nil || config.BuildID == "" {
		return nil, fmt.Errorf("security requires a store and a build")
	}
	if config.Service != nil && config.Service.Registry != nil {
		return nil, fmt.Errorf("security service is already bound to a session")
	}
	service := config.Service
	if service == nil {
		service = &security.SecurityService{}
	}
	service.Registry = security.NewRegistry(schemaContract{types})
	service.Store = config.Store
	service.SessionID = sessionID
	vm := sobek.New()
	builder := newBridge(vm)
	builder.security = service
	object := vm.NewObject()
	for name, method := range map[string]func(sobek.FunctionCall) sobek.Value{
		"registerAction": builder.registerSecurityAction, "registerPermission": builder.registerPermission, "registerGroupType": builder.registerGroupType,
		"registerRelationship": builder.registerRelationship, "registerPolicy": builder.registerPolicy,
	} {
		if err := object.DefineDataProperty(name, vm.ToValue(method), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
			return nil, err
		}
	}
	if err := vm.GlobalObject().DefineDataProperty("Security", object, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return nil, err
	}
	if err := service.Registry.Initialize(func() error {
		loader := NewModuleLoader(vm)
		for _, entry := range entries {
			builder.owner = entry.Package.ID()
			if err := interruptible(ctx, vm, func() error {
				_, err := loader.Run(entry.Package, entry.Path)
				return err
			}); err != nil {
				return fmt.Errorf("load security %s: %w", entry.Package.ID(), err)
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	fingerprint, err := service.Registry.Fingerprint()
	if err != nil {
		return nil, err
	}
	if err := service.Store.CheckRegistry(ctx, config.BuildID, fingerprint); err != nil {
		return nil, err
	}
	return service, nil
}

func (bridge *EventBridge) InstallSecurity(service *security.SecurityService) error {
	if service == nil {
		return nil
	}
	bridge.security = service
	object := bridge.vm.NewObject()
	methods := map[string]func(sobek.FunctionCall) sobek.Value{
		"setPermission": bridge.setPermission, "removePermission": bridge.removePermission, "createGroup": bridge.createGroup, "deleteGroup": bridge.deleteGroup,
		"can": bridge.securityCan, "require": bridge.securityRequire, "addRelationship": bridge.addRelationship, "removeRelationship": bridge.removeRelationship,
	}
	for name, method := range methods {
		if err := object.DefineDataProperty(name, bridge.vm.ToValue(method), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
			return err
		}
	}
	return bridge.vm.Get("Application").ToObject(bridge.vm).DefineDataProperty("security", object, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE)
}

func (bridge *EventBridge) registerSecurityAction(call sobek.FunctionCall) sobek.Value {
	if err := bridge.security.Registry.RegisterAction(bridge.owner, bridge.name(call.Argument(0)), bridge.name(call.Argument(1))); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) registerPermission(call sobek.FunctionCall) sobek.Value {
	var p security.Permission
	if err := json.Unmarshal(bridge.encode(call.Argument(1)), &p); err != nil {
		bridge.fail(err)
	}
	if err := bridge.security.Registry.RegisterPermission(bridge.owner, bridge.name(call.Argument(0)), p); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) registerGroupType(call sobek.FunctionCall) sobek.Value {
	var d security.GroupDefinition
	if err := json.Unmarshal(bridge.encode(call.Argument(1)), &d); err != nil {
		bridge.fail(err)
	}
	if err := bridge.security.Registry.RegisterGroup(bridge.owner, bridge.name(call.Argument(0)), d); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) permissionChange(call sobek.FunctionCall, remove bool) sobek.Value {
	var a security.Assignment
	if err := json.Unmarshal(bridge.encode(call.Argument(0)), &a); err != nil {
		bridge.fail(err)
	}
	if err := bridge.security.ChangeAssignment(bridge.ctx, a, remove); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) setPermission(call sobek.FunctionCall) sobek.Value {
	return bridge.permissionChange(call, false)
}
func (bridge *EventBridge) removePermission(call sobek.FunctionCall) sobek.Value {
	return bridge.permissionChange(call, true)
}
func (bridge *EventBridge) createGroup(call sobek.FunctionCall) sobek.Value {
	var e security.Entity
	if err := json.Unmarshal(bridge.encode(call.Argument(0)), &e); err != nil {
		bridge.fail(err)
	}
	if err := bridge.security.CreateGroup(bridge.ctx, e); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) deleteGroup(call sobek.FunctionCall) sobek.Value {
	if err := bridge.security.DeleteGroup(bridge.ctx, bridge.name(call.Argument(0))); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (bridge *EventBridge) registerRelationship(call sobek.FunctionCall) sobek.Value {
	var d security.RelationshipDefinition
	if err := json.Unmarshal(bridge.encode(call.Argument(1)), &d); err != nil {
		bridge.fail(err)
	}
	if err := bridge.security.Registry.RegisterRelationship(bridge.owner, bridge.name(call.Argument(0)), d); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) registerPolicy(call sobek.FunctionCall) sobek.Value {
	name := bridge.name(call.Argument(0))
	var p security.Policy
	decoder := json.NewDecoder(bytes.NewReader(bridge.encode(call.Argument(1))))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&p); err != nil {
		bridge.fail(fmt.Errorf("module %s definition %s: invalid policy: %w", bridge.owner, name, err))
	}
	if err := bridge.security.Registry.RegisterPolicy(bridge.owner, name, p); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) securityRequest(call sobek.FunctionCall) security.AuthorizationRequest {
	var request struct {
		Resource string `json:"resource"`
		Action   string `json:"action"`
	}
	if err := json.Unmarshal(bridge.encode(call.Argument(0)), &request); err != nil {
		bridge.fail(err)
	}
	return security.AuthorizationRequest{ResourceID: request.Resource, Action: request.Action}
}
func (bridge *EventBridge) securityCan(call sobek.FunctionCall) sobek.Value {
	decision, err := bridge.security.Authorize(bridge.ctx, bridge.securityRequest(call))
	if err != nil {
		bridge.fail(err)
	}
	return bridge.vm.ToValue(decision.Allowed)
}
func (bridge *EventBridge) securityRequire(call sobek.FunctionCall) sobek.Value {
	if err := bridge.security.Require(bridge.ctx, bridge.securityRequest(call)); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) changeRelationship(call sobek.FunctionCall, add bool) sobek.Value {
	var r security.Relationship
	if err := json.Unmarshal(bridge.encode(call.Argument(0)), &r); err != nil {
		bridge.fail(err)
	}
	if err := bridge.security.ChangeRelationship(bridge.ctx, r, add); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}
func (bridge *EventBridge) addRelationship(call sobek.FunctionCall) sobek.Value {
	return bridge.changeRelationship(call, true)
}
func (bridge *EventBridge) removeRelationship(call sobek.FunctionCall) sobek.Value {
	return bridge.changeRelationship(call, false)
}

type schemaContract struct {
	types *schema.Schema
}

func (contract schemaContract) Type(name string) error {
	_, err := contract.types.Type(name)
	return err
}

func (contract schemaContract) IsA(actual, expected string) bool {
	return actual == expected || contract.types.IsA(actual, expected)
}
