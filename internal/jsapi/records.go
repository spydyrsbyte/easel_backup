package jsapi

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"easel/internal/automation"
	"easel/internal/manifest"
	"easel/internal/schema"
	"github.com/grafana/sobek"
)

type recordState struct {
	schema   *schema.Schema
	store    automation.Records
	debug    bool
	ready    bool
	tx       automation.Transaction
	handles  []*recordHandle
	finalize sobek.Callable
	mutex    sync.Mutex
	warnings []string
}

const recordBootstrap = `(function (native, easel) {
  "use strict";
  const typeKey = Symbol("easel.easel.type");
  class Record {
    static ids() {
      let target = this;
      while (target && !Object.prototype.hasOwnProperty.call(target, typeKey)) target = Object.getPrototypeOf(target);
      if (!target) throw new TypeError("Use ids on a declared record type");
      return native.ids(target[typeKey]);
    }
    constructor(id) {
      let target = new.target;
      while (target && !Object.prototype.hasOwnProperty.call(target, typeKey)) target = Object.getPrototypeOf(target);
      if (!target) throw new TypeError("Easel.Record cannot be constructed directly; construct a record type such as host.Type");
      const data = id === undefined ? native.create(target[typeKey]) : native.load(target[typeKey], String(id));
      Object.defineProperty(this, "_data", { value: data, enumerable: false, writable: false, configurable: false });
    }
    get id() { return native.id(this._data); }
    get type() { return native.type(this._data); }
    save() { native.save(this._data); return this; }
    remove() { native.remove(this._data); }
  }
  Object.defineProperty(easel, "Record", { value: Record, enumerable: true });

  const generated = new Map();
  const hosts = Object.create(null);
  const owners = Object.create(null);
  for (const type of native.types()) {
    const Base = type.parent ? generated.get(type.parent) : Record;
    const cls = ({ [type.name]: class extends Base { constructor(id) { super(id); } } })[type.name];
    Object.defineProperty(cls, typeKey, { value: type.id });
    for (const field of type.leaves) {
      Object.defineProperty(cls.prototype, field, {
        get() { return this._data[field]; },
        set(value) { this._data[field] = value; },
        enumerable: true, configurable: true
      });
    }
    generated.set(type.id, cls);
    if (!hosts[type.host]) {
      const [owner, host] = type.host.split(".");
      if (!owners[owner]) {
        if (owner in globalThis) throw new TypeError("owner " + owner + " conflicts with an existing global");
        owners[owner] = Object.create(null);
        Object.defineProperty(globalThis, owner, { value: owners[owner], enumerable: true });
      }
      hosts[type.host] = Object.create(null);
      Object.defineProperty(owners[owner], host, { value: hosts[type.host], enumerable: true });
    }
    Object.defineProperty(hosts[type.host], type.name, { value: cls, enumerable: true, configurable: true });
  }

  function fill(target, data, fields, created, nested) {
    for (const name of Object.keys(fields)) {
      const field = fields[name];
      const own = Object.getOwnPropertyDescriptor(target, name);
      if (field.branch) {
        if (own && "value" in own && own.value && typeof own.value === "object") {
          fill(own.value, data[name], field.fields, created, true);
        } else if (!own && !(name in target)) {
          const branch = {};
          fill(branch, data[name], field.fields, created, true);
          Object.preventExtensions(branch);
          Object.defineProperty(target, name, { value: branch, enumerable: true });
        } else if (native.debug && own && own.get && !own.set) {
          native.warn("branch " + name + " is declared by a getter, so Easel cannot add its stored fields");
        }
        continue;
      }
      if (own && "value" in own) {
        if (created) data[name] = own.value;
        delete target[name];
        if (native.debug && created && field.hasDefault) native.warn("field " + name + " has both .default and a class field; the class field wins");
      }
      if (nested && !(name in target)) {
        Object.defineProperty(target, name, {
          get() { return data[name]; },
          set(value) { data[name] = value; },
          enumerable: true
        });
      }
    }
  }

  return function finalize(packages) {
    const finals = new Map();
    const order = native.types();
    const layers = new Map(order.map(type => [type.id, []]));
    const codeOnly = new Map(order.map(type => [type.id, []]));
    for (const entry of packages) {
      const seen = new Set();
      for (const value of entry.exports) {
        if (typeof value !== "function") continue;
        const parent = Object.getPrototypeOf(value);
        for (const [id, cls] of generated) {
          if (parent !== cls) continue;
          if (value.name === cls.name) {
            if (seen.has(id)) throw new TypeError("package " + entry.package + " has more than one layer for " + id);
            seen.add(id);
            layers.get(id).push(value);
          } else {
            codeOnly.get(id).push(value);
          }
        }
      }
    }
    for (const type of order) {
      const base = generated.get(type.id);
      if (type.parent) {
        const parentFinal = finals.get(type.parent);
        Object.setPrototypeOf(base, parentFinal);
        Object.setPrototypeOf(base.prototype, parentFinal.prototype);
      }
      let top = base;
      for (const layer of layers.get(type.id)) {
        Object.setPrototypeOf(layer, top);
        Object.setPrototypeOf(layer.prototype, top.prototype);
        if (native.debug) {
          for (const field of type.leaves) {
            const own = Object.getOwnPropertyDescriptor(layer.prototype, field);
            if (own && own.get && !own.set) native.warn(layer.name + " layer from " + type.id + " makes field " + field + " read-only");
          }
        }
        top = layer;
      }
      const tree = native.describe(type.id);
      const Final = ({ [type.name]: class extends top {
        constructor(id) {
          super(id);
          if (new.target === Final) {
            fill(this, this._data, tree, native.created(this._data), false);
            Object.preventExtensions(this);
          } else if (codeOnly.get(type.id).includes(new.target)) {
            fill(this, this._data, tree, native.created(this._data), false);
          }
        }
      } })[type.name];
      for (const sub of codeOnly.get(type.id)) {
        Object.setPrototypeOf(sub, Final);
        Object.setPrototypeOf(sub.prototype, Final.prototype);
      }
      finals.set(type.id, Final);
      Object.defineProperty(hosts[type.host], type.name, { value: Final, enumerable: true, configurable: false, writable: false });
    }
  };
})`

func (bridge *EventBridge) InstallRecords(composed *schema.Schema, store automation.Records, debug bool) error {
	bridge.records = &recordState{schema: composed, store: store, debug: debug}
	native := bridge.vm.NewObject()
	for name, method := range map[string]func(sobek.FunctionCall) sobek.Value{
		"types": bridge.recordTypes, "ids": bridge.recordIDs, "describe": bridge.describeRecord, "create": bridge.createRecord, "load": bridge.loadRecord,
		"save": bridge.saveRecord, "remove": bridge.removeRecord, "id": bridge.recordID, "type": bridge.recordTypeName,
		"created": bridge.recordCreated, "warn": bridge.recordWarn,
	} {
		if err := native.Set(name, method); err != nil {
			return err
		}
	}
	if err := native.Set("debug", debug); err != nil {
		return err
	}
	install, err := bridge.vm.RunString(recordBootstrap)
	if err != nil {
		return fmt.Errorf("install record bootstrap: %w", err)
	}
	call, _ := sobek.AssertFunction(install)
	finalize, err := call(sobek.Undefined(), native, bridge.vm.Get("Easel"))
	if err != nil {
		return fmt.Errorf("install record classes: %w", err)
	}
	bridge.records.finalize, _ = sobek.AssertFunction(finalize)
	return nil
}

func (bridge *EventBridge) FinalizeRecords(packages []manifest.Package) error {
	entries := []any{}
	for _, pkg := range packages {
		entry := bridge.vm.NewObject()
		if err := entry.Set("package", pkg.ID()); err != nil {
			return err
		}
		if err := entry.Set("exports", bridge.modules.exports(pkg.ID())); err != nil {
			return err
		}
		entries = append(entries, entry)
	}
	if _, err := bridge.records.finalize(sobek.Undefined(), bridge.vm.NewArray(entries...)); err != nil {
		return fmt.Errorf("finalize record classes: %w", err)
	}
	bridge.records.ready = true
	return nil
}

func (bridge *EventBridge) Warnings() []string {
	if bridge.records == nil {
		return nil
	}
	bridge.records.mutex.Lock()
	defer bridge.records.mutex.Unlock()
	return append([]string(nil), bridge.records.warnings...)
}

func (bridge *EventBridge) warn(message string) {
	bridge.records.mutex.Lock()
	defer bridge.records.mutex.Unlock()
	bridge.records.warnings = append(bridge.records.warnings, message)
}

func (bridge *EventBridge) transaction(ctx context.Context) (automation.Transaction, error) {
	state := bridge.records
	if state == nil || state.store == nil {
		return nil, fmt.Errorf("game records are not configured")
	}
	if state.tx == nil {
		tx, err := state.store.Begin(ctx)
		if err != nil {
			return nil, err
		}
		state.tx = tx
	}
	return state.tx, nil
}

func (bridge *EventBridge) withTransaction(ctx context.Context) (context.Context, error) {
	if bridge.records == nil || bridge.records.store == nil {
		return ctx, nil
	}
	tx, err := bridge.transaction(ctx)
	if err != nil {
		return nil, err
	}
	return automation.WithTransaction(ctx, tx), nil
}

func (bridge *EventBridge) FinishRequest(ctx context.Context, err error) error {
	effects := bridge.requestEffects
	bridge.requestEffects = nil
	committed := false
	defer func() {
		for _, effect := range effects {
			effect(committed)
		}
	}()
	deliveries := bridge.deliveries
	bridge.deliveries = nil
	flush := func() error {
		committed = err == nil
		if err != nil {
			return err
		}
		for _, deliver := range deliveries {
			if deliveryErr := deliver(); deliveryErr != nil {
				return fmt.Errorf("%w: %w", automation.ErrPostCommit, deliveryErr)
			}
		}
		return nil
	}
	state := bridge.records
	if state == nil {
		return flush()
	}
	if state.debug {
		for _, handle := range state.handles {
			if handle.dirty && !handle.removed {
				bridge.warn(fmt.Sprintf("%s record %s was changed but never saved", handle.record.Type, handle.record.ID))
			}
		}
	}
	state.handles = nil
	tx := state.tx
	state.tx = nil
	if tx == nil {
		return flush()
	}
	if err != nil {
		_ = tx.Rollback(context.Background())
		return err
	}
	err = tx.Commit(ctx)
	return flush()
}

func (bridge *EventBridge) OnRequestFinished(effect func(bool)) {
	bridge.requestEffects = append(bridge.requestEffects, effect)
}

func (bridge *EventBridge) DeliverAfterCommit(deliver func() error) {
	bridge.deliveries = append(bridge.deliveries, deliver)
}

func (bridge *EventBridge) requireRecords() *recordState {
	state := bridge.records
	if state == nil || !state.ready {
		bridge.fail(fmt.Errorf("records are not available until Load.Data.Ready"))
	}
	return state
}

func (bridge *EventBridge) handle(value sobek.Value) *recordHandle {
	object, ok := value.Export().(*fieldObject)
	if !ok || object.parent != nil {
		bridge.fail(fmt.Errorf("value is not record data"))
	}
	return object.handle
}

func (bridge *EventBridge) track(record automation.Record, created bool) sobek.Value {
	handle := &recordHandle{bridge: bridge, record: record, created: created}
	declared, err := bridge.records.schema.Type(record.Type)
	if err != nil {
		bridge.fail(err)
	}
	handle.root = handle.newObject(declared.Fields, record.Data, nil, "")
	bridge.records.handles = append(bridge.records.handles, handle)
	return handle.root
}

func (bridge *EventBridge) recordTypes(sobek.FunctionCall) sobek.Value {
	state := bridge.records
	ordered := []any{}
	added := map[string]bool{}
	var add func(name string)
	add = func(name string) {
		if added[name] {
			return
		}
		declared := state.schema.Types[name]
		if declared.Parent != "" {
			add(declared.Parent)
		}
		added[name] = true
		leaves := []any{}
		for field, definition := range declared.Local {
			if definition.Type != schema.TypeField {
				leaves = append(leaves, field)
			}
		}
		ordered = append(ordered, map[string]any{"id": declared.ID, "host": declared.Host, "name": declared.Name, "parent": declared.Parent, "leaves": leaves})
	}
	for _, name := range state.schema.Names() {
		add(name)
	}
	return bridge.vm.ToValue(ordered)
}

func describeFields(fields map[string]*schema.Field) map[string]any {
	description := map[string]any{}
	for name, field := range fields {
		entry := map[string]any{"branch": field.Type == schema.TypeField, "hasDefault": field.HasDefault}
		if field.Type == schema.TypeField {
			entry["fields"] = describeFields(field.Fields)
		}
		description[name] = entry
	}
	return description
}

func (bridge *EventBridge) describeRecord(call sobek.FunctionCall) sobek.Value {
	declared, err := bridge.records.schema.Type(bridge.name(call.Argument(0)))
	if err != nil {
		bridge.fail(err)
	}
	return bridge.vm.ToValue(describeFields(declared.Fields))
}

func defaults(fields map[string]*schema.Field) map[string]any {
	values := map[string]any{}
	for name, field := range fields {
		switch {
		case field.HasDefault:
			values[name] = normalize(field.Default)
		case field.Type == schema.TypeField && field.Required:
			values[name] = defaults(field.Fields)
		}
	}
	return values
}

func (bridge *EventBridge) createRecord(call sobek.FunctionCall) sobek.Value {
	state := bridge.requireRecords()
	typeName := bridge.name(call.Argument(0))
	declared, err := state.schema.Type(typeName)
	if err != nil {
		bridge.fail(err)
	}
	return bridge.track(automation.Record{Type: typeName, Data: defaults(declared.Fields)}, true)
}

func (bridge *EventBridge) loadRecord(call sobek.FunctionCall) sobek.Value {
	bridge.requireRecords()
	tx, err := bridge.transaction(bridge.ctx)
	if err != nil {
		bridge.fail(err)
	}
	record, err := tx.Load(bridge.ctx, bridge.name(call.Argument(0)), bridge.name(call.Argument(1)))
	if err != nil {
		bridge.fail(err)
	}
	return bridge.track(record, false)
}

func (bridge *EventBridge) recordIDs(call sobek.FunctionCall) sobek.Value {
	bridge.requireRecords()
	tx, err := bridge.transaction(bridge.ctx)
	if err != nil {
		bridge.fail(err)
	}
	lister, ok := tx.(interface {
		IDs(context.Context, string) ([]string, error)
	})
	if !ok {
		bridge.fail(fmt.Errorf("record store does not support discovery"))
	}
	ids, err := lister.IDs(bridge.ctx, bridge.name(call.Argument(0)))
	if err != nil {
		bridge.fail(err)
	}
	return bridge.toJavaScript(ids)
}

func (bridge *EventBridge) saveRecord(call sobek.FunctionCall) sobek.Value {
	handle := bridge.handle(call.Argument(0))
	if handle.removed {
		bridge.fail(errors.New("a removed record cannot be saved"))
	}
	tx, err := bridge.transaction(bridge.ctx)
	if err != nil {
		bridge.fail(err)
	}
	if handle.created {
		saved, err := tx.Create(bridge.ctx, handle.record)
		if err != nil {
			bridge.fail(err)
		}
		handle.record.ID, handle.record.Version, handle.created = saved.ID, saved.Version, false
	} else if err := tx.Save(bridge.ctx, handle.record); err != nil {
		bridge.fail(err)
	}
	handle.dirty = false
	return sobek.Undefined()
}

func (bridge *EventBridge) removeRecord(call sobek.FunctionCall) sobek.Value {
	handle := bridge.handle(call.Argument(0))
	if !handle.created && !handle.removed {
		tx, err := bridge.transaction(bridge.ctx)
		if err != nil {
			bridge.fail(err)
		}
		if err := tx.Remove(bridge.ctx, handle.record); err != nil {
			bridge.fail(err)
		}
	}
	handle.removed = true
	return sobek.Undefined()
}

func (bridge *EventBridge) recordID(call sobek.FunctionCall) sobek.Value {
	handle := bridge.handle(call.Argument(0))
	if handle.record.ID == "" {
		return sobek.Undefined()
	}
	return bridge.vm.ToValue(handle.record.ID)
}

func (bridge *EventBridge) recordTypeName(call sobek.FunctionCall) sobek.Value {
	return bridge.vm.ToValue(bridge.handle(call.Argument(0)).record.Type)
}

func (bridge *EventBridge) recordCreated(call sobek.FunctionCall) sobek.Value {
	return bridge.vm.ToValue(bridge.handle(call.Argument(0)).created)
}

func (bridge *EventBridge) recordWarn(call sobek.FunctionCall) sobek.Value {
	if bridge.records.debug {
		bridge.warn(call.Argument(0).String())
	}
	return sobek.Undefined()
}
