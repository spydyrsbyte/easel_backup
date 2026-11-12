package events

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestEmitDispatchesInOrderAndQueuesNestedEmissions(t *testing.T) {
	engine := New(nil)
	ctx := context.Background()
	for name, valid := range map[string]Origin{"first": Server, "second": Automation} {
		if err := engine.Register("app", name, Definition{Valid: valid, Fields: map[string]string{}}); err != nil {
			t.Fatal(err)
		}
	}
	order := []string{}
	handlers := []struct {
		event   string
		handler Handler
	}{
		{"first", func(ctx context.Context, _ json.RawMessage) error {
			order = append(order, "first:a")
			return engine.Emit(ctx, Automation, "second", json.RawMessage(`{}`))
		}},
		{"first", func(context.Context, json.RawMessage) error { order = append(order, "first:b"); return nil }},
		{"second", func(context.Context, json.RawMessage) error { order = append(order, "second"); return nil }},
	}
	for _, h := range handlers {
		if err := engine.On("app", h.event, h.handler); err != nil {
			t.Fatal(err)
		}
	}
	engine.FinishLoading()
	if err := engine.Emit(ctx, Server, "first", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	if want := []string{"first:a", "first:b", "second"}; !reflect.DeepEqual(order, want) {
		t.Fatalf("order: %v", order)
	}
}

func TestEmitValidatesOriginAndPayload(t *testing.T) {
	engine := New(nil)
	ctx := context.Background()
	if err := engine.Register("app", "scored", Definition{Valid: Client, Fields: map[string]string{"count": "integer"}}); err != nil {
		t.Fatal(err)
	}
	if err := engine.Emit(ctx, Client, "scored", json.RawMessage(`{"count":1}`)); err == nil || !strings.Contains(err.Error(), "before loading finishes") {
		t.Fatalf("emit while loading: %v", err)
	}
	if err := engine.Register("app", "custom", Definition{Valid: Client, Fields: map[string]string{"value": "Character"}}); err == nil || !strings.Contains(err.Error(), "no effective-type resolver") {
		t.Fatalf("custom type without resolver: %v", err)
	}
	engine.FinishLoading()
	if err := engine.Register("app", "late", Definition{Valid: Client}); err == nil {
		t.Fatal("late registration accepted")
	}
	for name, test := range map[string]struct {
		origin  Origin
		payload string
		want    string
	}{
		"origin":     {Server, `{"count":1}`, "rejects origin"},
		"missing":    {Client, `{}`, "missing field"},
		"fraction":   {Client, `{"count":1.5}`, "expected integer"},
		"undeclared": {Client, `{"count":1,"extra":1}`, "undeclared field"},
		"not object": {Client, `[1]`, "must be a JSON object"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := engine.Emit(ctx, test.origin, "scored", json.RawMessage(test.payload)); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	if err := engine.Emit(ctx, Client, "scored", json.RawMessage(`{"count":2}`)); err != nil {
		t.Fatal(err)
	}
}

func TestListenCancelAndInitialization(t *testing.T) {
	engine := New(nil)
	ctx := context.Background()
	for _, name := range []string{"tick", "init"} {
		if err := engine.Register("app", name, Definition{Valid: Server, Fields: map[string]string{}}); err != nil {
			t.Fatal(err)
		}
	}
	ticks, inits := 0, 0
	cancel, err := engine.Listen("app", "tick", func(context.Context, json.RawMessage) error { ticks++; return nil })
	if err != nil {
		t.Fatal(err)
	}
	if err := engine.On("app", "init", func(context.Context, json.RawMessage) error { inits++; return nil }); err != nil {
		t.Fatal(err)
	}
	if err := engine.InitializeEvent(ctx, "init"); err != nil || inits != 1 {
		t.Fatalf("initialize: %d %v", inits, err)
	}
	if err := engine.InitializeEvent(ctx, "init"); err == nil || !strings.Contains(err.Error(), "already dispatched") {
		t.Fatalf("second initialize: %v", err)
	}
	engine.FinishLoading()
	if err := engine.On("app", "tick", func(context.Context, json.RawMessage) error { return nil }); err == nil {
		t.Fatal("listener registered after loading")
	}
	if err := engine.Emit(ctx, Server, "init", json.RawMessage(`{}`)); err == nil || !strings.Contains(err.Error(), "cannot be emitted") {
		t.Fatalf("emit initialization event: %v", err)
	}
	if err := engine.Emit(ctx, Server, "tick", json.RawMessage(`{}`)); err != nil || ticks != 1 {
		t.Fatalf("tick: %d %v", ticks, err)
	}
	cancel()
	if err := engine.Emit(ctx, Server, "tick", json.RawMessage(`{}`)); err != nil || ticks != 1 {
		t.Fatalf("cancelled tick: %d %v", ticks, err)
	}
}
