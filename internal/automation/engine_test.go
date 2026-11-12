package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func newTestService(t *testing.T, source string) *Service {
	t.Helper()
	definitions, err := Parse(source)
	if err != nil {
		t.Fatal(err)
	}
	repository := &FileRepository{Directory: t.TempDir()}
	for _, definition := range definitions {
		if err := repository.Save(context.Background(), Saved{Definition: definition, Creator: Creator{Kind: "system", ID: "test"}}); err != nil {
			t.Fatal(err)
		}
	}
	return New(repository, nil, AllowAllStub{})
}

func TestRunArithmeticAndCommand(t *testing.T) {
	service := newTestService(t, "d:add a b\nlet sum {\"expr\":\"add\",\"args\":[{\"var\":\"a\"},{\"var\":\"b\"}]}\nreturn $sum\n")
	result, err := service.Run(context.Background(), "add", []any{json.Number("2"), json.Number("3")})
	if err != nil || result.Value != json.Number("5") {
		t.Fatalf("run: %#v %v", result.Value, err)
	}
	result, err = service.Command(context.Background(), ".add 2 3")
	if err != nil || result.Value != json.Number("5") {
		t.Fatalf("command: %#v %v", result.Value, err)
	}
	if _, err := service.Command(context.Background(), "add 2 3"); err == nil || !strings.Contains(err.Error(), "expected .automationName") {
		t.Fatalf("command without dot: %v", err)
	}
}

func TestRunLoopsAndEmits(t *testing.T) {
	service := newTestService(t, "d:sum list\nlet total 0\neach $list item\ndelta $total $item\nendblock\ne:summed {\"ok\":true}\nreturn $total\n")
	result, err := service.Run(context.Background(), "sum", []any{[]any{json.Number("1"), json.Number("2"), json.Number("4")}})
	if err != nil || result.Value != json.Number("7") {
		t.Fatalf("sum: %#v %v", result.Value, err)
	}
	want := []Emission{{Name: "summed", Payload: map[string]any{"ok": true}}}
	if !reflect.DeepEqual(result.Events, want) {
		t.Fatalf("events: %#v", result.Events)
	}
}

func TestRunLimitsAndFailures(t *testing.T) {
	service := newTestService(t, "d:three\nlet a 1\nlet b 2\nreturn $a\nd:loop\n.loop\n")
	service.MaxSteps = 2
	if _, err := service.Run(context.Background(), "three", nil); err == nil || !strings.Contains(err.Error(), "instruction limit exceeded") {
		t.Fatalf("step limit: %v", err)
	}
	service.MaxSteps = 100000
	if _, err := service.Run(context.Background(), "loop", nil); err == nil || !strings.Contains(err.Error(), "call depth exceeded") {
		t.Fatalf("depth limit: %v", err)
	}
	if _, err := service.Run(context.Background(), "missing", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	if _, err := service.Run(context.Background(), "three", []any{json.Number("1")}); err == nil || !strings.Contains(err.Error(), "expects 0 arguments") {
		t.Fatalf("arity: %v", err)
	}
	service.Access = nil
	if _, err := service.Run(context.Background(), "three", nil); err == nil || !strings.Contains(err.Error(), "access policy missing") {
		t.Fatalf("missing access: %v", err)
	}
}

type selectiveAccess map[string]error

func (access selectiveAccess) Authorize(_ context.Context, _ string, saved Saved) error {
	return access[saved.Definition.Name]
}

func TestListHidesOnlyDenials(t *testing.T) {
	service := newTestService(t, "d:open\nreturn 1\nd:hidden\nreturn 2\n")
	service.Access = selectiveAccess{"hidden": fmt.Errorf("%w: test", ErrDenied)}
	listed, err := service.List(context.Background())
	if err != nil || len(listed) != 1 || listed[0].Definition.Name != "open" {
		t.Fatalf("list: %+v %v", listed, err)
	}
	failure := errors.New("store unavailable")
	service.Access = selectiveAccess{"hidden": failure}
	if _, err := service.List(context.Background()); !errors.Is(err, failure) {
		t.Fatalf("infrastructure failure hidden: %v", err)
	}
}

func TestRunLoadsCalledDefinitionsOnDemand(t *testing.T) {
	service := newTestService(t, "d:outer\n.inner -> $x\nreturn $x\nd:inner\nreturn 3\n")
	result, err := service.Run(context.Background(), "outer", nil)
	if err != nil || result.Value != json.Number("3") {
		t.Fatalf("run: %#v %v", result.Value, err)
	}
}

type countingTransaction struct {
	commits int
	saves   int
}

func (tx *countingTransaction) Load(context.Context, string, string) (Record, error) {
	return Record{Type: "x", ID: "1", Data: map[string]any{"n": json.Number("1")}}, nil
}
func (tx *countingTransaction) Save(context.Context, Record) error { tx.saves++; return nil }
func (tx *countingTransaction) Create(context.Context, Record) (Record, error) {
	return Record{}, nil
}
func (tx *countingTransaction) Remove(context.Context, Record) error { return nil }
func (tx *countingTransaction) Commit(context.Context) error         { tx.commits++; return nil }
func (tx *countingTransaction) Rollback(context.Context) error       { return nil }

func TestRunJoinsSharedTransaction(t *testing.T) {
	service := newTestService(t, "d:bump\nload x 1 rec\ndelta $rec.n 1\nsave $rec\nreturn $rec.n\n")
	shared := &countingTransaction{}
	result, err := service.Run(WithTransaction(context.Background(), shared), "bump", nil)
	if err != nil || result.Value != json.Number("2") {
		t.Fatalf("run: %#v %v", result.Value, err)
	}
	if shared.saves != 1 || shared.commits != 0 {
		t.Fatalf("shared transaction: %d saves, %d commits", shared.saves, shared.commits)
	}
}
