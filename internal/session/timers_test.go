package session

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"easel/internal/manifest"
)

func TestScheduledEventsRespectCancellationAndFailedRequests(t *testing.T) {
	pkg := newPackage(t, `{"type":"application","owner":"easel","host":"test","name":"timers","server":{"application":{"entry":"main.mjs"}}}`, map[string]string{"main.mjs": `
Application.events.register("tick",{valid:1});
export function handleMessage(message){
 if(message.op==="schedule")return Server.events.after("tick",40,{});
 if(message.op==="abort"){Server.events.after("tick",1,{});throw new Error("abort");}
 if(message.op==="cancel"||message.op==="abort-cancel"){Server.events.cancel(message.id);if(message.op==="abort-cancel")throw new Error("abort");}
 return null;
}`})
	runtime, err := NewGame(context.Background(), Game{Packages: []manifest.Package{pkg}, AuthorizeClient: func(context.Context, string, json.RawMessage, bool) error { return nil }})
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	delivered := make(chan struct{}, 10)
	off, err := runtime.(ClientRuntime).SubscribeClient(context.Background(), "tick", func(json.RawMessage) { delivered <- struct{}{} })
	if err != nil {
		t.Fatal(err)
	}
	defer off()
	if _, err := runtime.Dispatch(context.Background(), json.RawMessage(`{"op":"abort"}`)); err == nil {
		t.Fatal("abort ignored")
	}
	select {
	case <-delivered:
		t.Fatal("failed request delivered a timer")
	case <-time.After(80 * time.Millisecond):
	}
	id, err := runtime.Dispatch(context.Background(), json.RawMessage(`{"op":"schedule"}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Dispatch(context.Background(), json.RawMessage(`{"op":"cancel","id":`+string(id)+`}`)); err != nil {
		t.Fatal(err)
	}
	select {
	case <-delivered:
		t.Fatal("canceled timer delivered")
	case <-time.After(80 * time.Millisecond):
	}
	id, err = runtime.Dispatch(context.Background(), json.RawMessage(`{"op":"schedule"}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Dispatch(context.Background(), json.RawMessage(`{"op":"abort-cancel","id":`+string(id)+`}`)); err == nil {
		t.Fatal("abort ignored")
	}
	select {
	case <-delivered:
	case <-time.After(time.Second):
		t.Fatal("failed request canceled an existing timer")
	}
}
