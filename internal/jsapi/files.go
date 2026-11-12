package jsapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"strings"

	"easel/internal/files"
	"easel/internal/security"
	"github.com/grafana/sobek"
)

const maxScriptFileBytes = 8 << 20

var fileHookNames = map[string]bool{"upload": true, "uploaded": true}

type FilesConfig struct {
	Store *files.Store
	Path  string
}

type UploadDecision struct {
	Allowed bool
	Reason  string
}

func (bridge *EventBridge) InstallFiles(config *FilesConfig) error {
	if config == nil || config.Store == nil {
		return nil
	}
	bridge.files = config
	bridge.fileHooks = map[string][]sobek.Callable{}
	object := bridge.vm.NewObject()
	for name, method := range map[string]func(sobek.FunctionCall) sobek.Value{
		"list": bridge.listFiles, "get": bridge.getFile, "create": bridge.createFile, "replace": bridge.replaceFile, "remove": bridge.removeFile,
		"read": bridge.readFile, "readText": bridge.readFileText, "url": bridge.fileURL, "on": bridge.onFile,
	} {
		if err := object.DefineDataProperty(name, bridge.vm.ToValue(method), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
			return err
		}
	}
	return bridge.vm.Get("Application").ToObject(bridge.vm).DefineDataProperty("files", object, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE)
}

func (bridge *EventBridge) fileValue(file files.File) map[string]any {
	return map[string]any{
		"id": file.ID, "name": file.Name, "mediaType": file.MediaType, "size": file.Size, "hash": file.Hash, "owner": file.Owner,
		"version": file.Version, "url": bridge.files.Path + "/" + file.ID,
	}
}

func (bridge *EventBridge) listFiles(sobek.FunctionCall) sobek.Value {
	listed, err := bridge.files.Store.List(bridge.ctx)
	if err != nil {
		bridge.fail(err)
	}
	found := make([]any, 0, len(listed))
	for _, file := range listed {
		found = append(found, bridge.fileValue(file))
	}
	return bridge.vm.ToValue(found)
}

func (bridge *EventBridge) getFile(call sobek.FunctionCall) sobek.Value {
	file, err := bridge.files.Store.Get(bridge.ctx, bridge.text(call.Argument(0), "file id"))
	if err != nil {
		bridge.fail(err)
	}
	return bridge.vm.ToValue(bridge.fileValue(file))
}

func (bridge *EventBridge) fileURL(call sobek.FunctionCall) sobek.Value {
	return bridge.vm.ToValue(bridge.files.Path + "/" + bridge.text(call.Argument(0), "file id"))
}

func (bridge *EventBridge) fileContents(value sobek.Value) (files.Upload, []byte) {
	if value == nil || sobek.IsUndefined(value) || sobek.IsNull(value) {
		bridge.fail(fmt.Errorf("a file takes {name, mediaType, and text, base64, or bytes}"))
	}
	object := value.ToObject(bridge.vm)
	field := func(name string) string {
		found := object.Get(name)
		if found == nil || sobek.IsUndefined(found) || sobek.IsNull(found) {
			return ""
		}
		text, ok := found.Export().(string)
		if !ok {
			bridge.fail(fmt.Errorf("file %s must be a string", name))
		}
		return text
	}
	upload := files.Upload{Name: field("name"), MediaType: field("mediaType"), Owner: security.Principal(bridge.ctx)}
	var contents []byte
	provided := 0
	for _, name := range []string{"text", "base64", "bytes"} {
		found := object.Get(name)
		if found == nil || sobek.IsUndefined(found) || sobek.IsNull(found) {
			continue
		}
		provided++
		switch name {
		case "text":
			contents = []byte(field(name))
		case "base64":
			decoded, err := base64.StdEncoding.DecodeString(field(name))
			if err != nil {
				bridge.fail(fmt.Errorf("file base64 is invalid"))
			}
			contents = decoded
		case "bytes":
			switch exported := found.Export().(type) {
			case sobek.ArrayBuffer:
				contents = append([]byte(nil), exported.Bytes()...)
			case []byte:
				contents = append([]byte(nil), exported...)
			default:
				bridge.fail(fmt.Errorf("file bytes must be an ArrayBuffer or a Uint8Array"))
			}
		}
	}
	if provided != 1 {
		bridge.fail(fmt.Errorf("a file takes exactly one of text, base64, or bytes"))
	}
	return upload, contents
}

func (bridge *EventBridge) createFile(call sobek.FunctionCall) sobek.Value {
	upload, contents := bridge.fileContents(call.Argument(0))
	store := bridge.files.Store
	file, err := store.Put(bridge.ctx, bytes.NewReader(contents), upload)
	if err != nil {
		bridge.fail(err)
	}
	bridge.OnRequestFinished(func(committed bool) {
		if !committed {
			_ = store.Remove(context.Background(), file.ID)
		}
	})
	return bridge.vm.ToValue(bridge.fileValue(file))
}

func (bridge *EventBridge) replaceFile(call sobek.FunctionCall) sobek.Value {
	id := bridge.text(call.Argument(0), "file id")
	upload, contents := bridge.fileContents(call.Argument(1))
	store := bridge.files.Store
	if upload.Name == "" || upload.MediaType == "" {
		current, err := store.Get(bridge.ctx, id)
		if err != nil {
			bridge.fail(err)
		}
		if upload.Name == "" {
			upload.Name = current.Name
		}
		if upload.MediaType == "" {
			upload.MediaType = current.MediaType
		}
	}
	file, previous, err := store.Exchange(bridge.ctx, id, 0, bytes.NewReader(contents), upload)
	if err != nil {
		bridge.fail(err)
	}
	bridge.OnRequestFinished(func(committed bool) {
		if committed {
			store.Release(context.Background(), previous)
			return
		}
		_ = store.Restore(context.Background(), previous)
	})
	return bridge.vm.ToValue(bridge.fileValue(file))
}

func (bridge *EventBridge) removeFile(call sobek.FunctionCall) sobek.Value {
	id := bridge.text(call.Argument(0), "file id")
	store := bridge.files.Store
	if _, err := store.Get(bridge.ctx, id); err != nil {
		bridge.fail(err)
	}
	bridge.OnRequestFinished(func(committed bool) {
		if committed {
			_ = store.Remove(context.Background(), id)
		}
	})
	return sobek.Undefined()
}

func (bridge *EventBridge) fileBytes(id string) []byte {
	file, contents, err := bridge.files.Store.Open(bridge.ctx, id)
	if err != nil {
		bridge.fail(err)
	}
	defer contents.Close()
	if file.Size > maxScriptFileBytes {
		bridge.fail(fmt.Errorf("file %s is larger than the %d bytes a script may read", id, maxScriptFileBytes))
	}
	data, err := io.ReadAll(io.LimitReader(contents, maxScriptFileBytes))
	if err != nil {
		bridge.fail(err)
	}
	return data
}

func (bridge *EventBridge) readFile(call sobek.FunctionCall) sobek.Value {
	return bridge.vm.ToValue(bridge.vm.NewArrayBuffer(bridge.fileBytes(bridge.text(call.Argument(0), "file id"))))
}

func (bridge *EventBridge) readFileText(call sobek.FunctionCall) sobek.Value {
	return bridge.vm.ToValue(string(bridge.fileBytes(bridge.text(call.Argument(0), "file id"))))
}

func (bridge *EventBridge) onFile(call sobek.FunctionCall) sobek.Value {
	name := bridge.text(call.Argument(0), "file event")
	if !fileHookNames[name] {
		bridge.fail(fmt.Errorf("unknown file event %q", name))
	}
	hook, ok := sobek.AssertFunction(call.Argument(1))
	if !ok {
		bridge.fail(fmt.Errorf("file hook must be a function"))
	}
	bridge.fileHooks[name] = append(bridge.fileHooks[name], hook)
	return sobek.Undefined()
}

func (bridge *EventBridge) EvaluateUpload(ctx context.Context, fields map[string]any) (UploadDecision, error) {
	refused := UploadDecision{Reason: "this table does not accept uploads"}
	if bridge.files == nil {
		return refused, nil
	}
	object := bridge.vm.NewObject()
	for key, value := range fields {
		if err := object.Set(key, value); err != nil {
			return UploadDecision{}, err
		}
	}
	var decision *UploadDecision
	_ = object.Set("allow", func(sobek.FunctionCall) sobek.Value {
		decision = &UploadDecision{Allowed: true}
		return sobek.Undefined()
	})
	_ = object.Set("refuse", func(call sobek.FunctionCall) sobek.Value {
		reason := "upload refused"
		if text, ok := call.Argument(0).Export().(string); ok && strings.TrimSpace(text) != "" {
			reason = text
		}
		decision = &UploadDecision{Reason: reason}
		return sobek.Undefined()
	})
	for _, hook := range bridge.fileHooks["upload"] {
		err := bridge.Within(ctx, bridge.origin, bridge.owner, func() error {
			_, err := hook(sobek.Undefined(), object)
			return err
		})
		if err != nil {
			return UploadDecision{}, fmt.Errorf("file hook upload: %w", err)
		}
		if decision != nil {
			return *decision, nil
		}
	}
	return refused, nil
}

func (bridge *EventBridge) FileUploaded(ctx context.Context, file files.File, user map[string]any) error {
	if bridge.files == nil {
		return nil
	}
	value := bridge.fileValue(file)
	for _, hook := range bridge.fileHooks["uploaded"] {
		err := bridge.Within(ctx, bridge.origin, bridge.owner, func() error {
			_, err := hook(sobek.Undefined(), bridge.vm.ToValue(value), bridge.vm.ToValue(user))
			return err
		})
		if err != nil {
			return fmt.Errorf("file hook uploaded: %w", err)
		}
	}
	return nil
}
