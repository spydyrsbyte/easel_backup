package jsapi

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"easel/internal/events"
	"github.com/grafana/sobek"
)

func (bridge *EventBridge) InstallGameServices(members func(context.Context) (any, error), schedule func(time.Duration, string, json.RawMessage) int64, cancel func(int64)) error {
	if members != nil {
		users := bridge.vm.NewObject()
		if err := users.Set("list", func(sobek.FunctionCall) sobek.Value { return bridge.plain(members(bridge.ctx)) }); err != nil {
			return err
		}
		if err := bridge.vm.Get("Application").ToObject(bridge.vm).DefineDataProperty("users", users, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
			return err
		}
	}
	serverEvents := bridge.vm.Get("Server").ToObject(bridge.vm).Get("events").ToObject(bridge.vm)
	if err := serverEvents.Set("after", func(call sobek.FunctionCall) sobek.Value {
		name := bridge.name(call.Argument(0))
		delay := call.Argument(1).ToFloat()
		if math.IsNaN(delay) || math.IsInf(delay, 0) || delay < 1 || delay > 86400000 {
			bridge.fail(fmt.Errorf("event delay must be 1..86400000 milliseconds"))
		}
		payload := append(json.RawMessage(nil), bridge.encode(call.Argument(2))...)
		if err := bridge.engine.Check(bridge.ctx, events.Server, name, payload); err != nil {
			bridge.fail(err)
		}
		id := schedule(time.Duration(delay)*time.Millisecond, name, payload)
		bridge.OnRequestFinished(func(committed bool) {
			if !committed {
				cancel(id)
			}
		})
		return bridge.vm.ToValue(id)
	}); err != nil {
		return err
	}
	return serverEvents.Set("cancel", func(call sobek.FunctionCall) sobek.Value {
		id := call.Argument(0).ToInteger()
		bridge.OnRequestFinished(func(committed bool) {
			if committed {
				cancel(id)
			}
		})
		return sobek.Undefined()
	})
}
