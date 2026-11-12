package jsapi

import (
	"encoding/json"
	"sort"
	"strconv"

	"easel/internal/automation"
	"easel/internal/schema"
	"github.com/grafana/sobek"
)

type recordHandle struct {
	bridge  *EventBridge
	record  automation.Record
	created bool
	removed bool
	dirty   bool
	root    *sobek.Object
}

type fieldObject struct {
	handle   *recordHandle
	fields   map[string]*schema.Field
	parent   *fieldObject
	key      string
	values   map[string]any
	children map[string]*sobek.Object
}

type arrayObject struct {
	handle *recordHandle
	owner  *fieldObject
	key    string
}

func (handle *recordHandle) newObject(fields map[string]*schema.Field, values map[string]any, parent *fieldObject, key string) *sobek.Object {
	object := &fieldObject{handle: handle, fields: fields, parent: parent, key: key, values: values, children: map[string]*sobek.Object{}}
	return handle.bridge.vm.NewDynamicObject(object)
}

func (object *fieldObject) attach() {
	if object.values != nil {
		return
	}
	object.values = map[string]any{}
	object.parent.attach()
	object.parent.values[object.key] = object.values
}

func (object *fieldObject) declared(key string) (*schema.Field, bool) {
	if object.fields == nil {
		return nil, true
	}
	field, found := object.fields[key]
	return field, found
}

func (object *fieldObject) Get(key string) sobek.Value {
	field, found := object.declared(key)
	if !found {
		return nil
	}
	if child, cached := object.children[key]; cached {
		return child
	}
	var value any
	present := false
	if object.values != nil {
		value, present = object.values[key]
	}
	if field != nil && field.Type == schema.TypeField {
		nested, _ := value.(map[string]any)
		child := object.handle.newObject(field.Fields, nested, object, key)
		object.children[key] = child
		return child
	}
	if !present {
		return nil
	}
	switch typed := value.(type) {
	case map[string]any:
		var nestedFields map[string]*schema.Field
		if field != nil && field.Type != schema.TypeMap {
			nestedFields = field.Fields
		}
		child := object.handle.newObject(nestedFields, typed, object, key)
		object.children[key] = child
		return child
	case []any:
		child := object.handle.bridge.vm.NewDynamicArray(&arrayObject{handle: object.handle, owner: object, key: key})
		object.children[key] = child
		return child
	}
	return object.handle.bridge.vm.ToValue(scalar(value))
}

func (object *fieldObject) Set(key string, value sobek.Value) bool {
	if _, found := object.declared(key); !found {
		return false
	}
	object.attach()
	object.values[key] = goValue(value)
	delete(object.children, key)
	object.handle.dirty = true
	return true
}

func (object *fieldObject) Has(key string) bool {
	if object.values == nil {
		return false
	}
	_, present := object.values[key]
	return present
}

func (object *fieldObject) Delete(key string) bool {
	field, found := object.declared(key)
	if !found || (field != nil && field.Required) {
		return false
	}
	if object.values != nil {
		delete(object.values, key)
	}
	delete(object.children, key)
	object.handle.dirty = true
	return true
}

func (object *fieldObject) Keys() []string {
	keys := []string{}
	for key := range object.values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func (array *arrayObject) slice() []any {
	items, _ := array.owner.values[array.key].([]any)
	return items
}

func (array *arrayObject) Len() int { return len(array.slice()) }

func (array *arrayObject) Get(index int) sobek.Value {
	items := array.slice()
	if index < 0 || index >= len(items) {
		return nil
	}
	return array.handle.bridge.vm.ToValue(plain(items[index]))
}

func (array *arrayObject) Set(index int, value sobek.Value) bool {
	if index < 0 {
		return false
	}
	items := array.slice()
	for len(items) <= index {
		items = append(items, nil)
	}
	items[index] = goValue(value)
	array.owner.values[array.key] = items
	array.handle.dirty = true
	return true
}

func (array *arrayObject) SetLen(length int) bool {
	if length < 0 {
		return false
	}
	items := array.slice()
	for len(items) < length {
		items = append(items, nil)
	}
	array.owner.values[array.key] = items[:length]
	array.handle.dirty = true
	return true
}

func scalar(value any) any {
	if number, ok := value.(json.Number); ok {
		if integer, err := strconv.ParseInt(string(number), 10, 64); err == nil {
			return integer
		}
		if float, err := number.Float64(); err == nil {
			return float
		}
	}
	return value
}

func plain(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		copied := make(map[string]any, len(typed))
		for key, item := range typed {
			copied[key] = plain(item)
		}
		return copied
	case []any:
		copied := make([]any, len(typed))
		for index, item := range typed {
			copied[index] = plain(item)
		}
		return copied
	}
	return scalar(value)
}

func goValue(value sobek.Value) any {
	if value == nil || sobek.IsUndefined(value) || sobek.IsNull(value) {
		return nil
	}
	return normalize(value.Export())
}

func normalize(value any) any {
	switch typed := value.(type) {
	case *fieldObject:
		return normalize(typed.values)
	case *arrayObject:
		return normalize(typed.slice())
	case map[string]any:
		copied := make(map[string]any, len(typed))
		for key, item := range typed {
			copied[key] = normalize(item)
		}
		return copied
	case []any:
		copied := make([]any, len(typed))
		for index, item := range typed {
			copied[index] = normalize(item)
		}
		return copied
	case int:
		return int64(typed)
	case int32:
		return int64(typed)
	case json.Number:
		return scalar(typed)
	}
	return value
}
