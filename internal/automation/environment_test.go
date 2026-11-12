package automation

import (
	"context"
	"testing"
)

func TestExecutionContextCannotBeReplacedByArguments(t *testing.T) {
	service := newTestService(t, "d:identity principal\nreturn {\"context\":\"principal\"}\n")
	values := map[string]any{"principal": "alice"}
	ctx := WithEnvironment(context.Background(), values)
	values["principal"] = "mallory"
	result, err := service.Run(ctx, "identity", []any{"mallory"})
	if err != nil || result.Value != "alice" {
		t.Fatal(result, err)
	}
	if _, err := service.Run(context.Background(), "identity", []any{"mallory"}); err == nil {
		t.Fatal("missing trusted execution context accepted")
	}
}
