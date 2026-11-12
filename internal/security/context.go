package security

import (
	"context"
	"encoding/json"
	"fmt"
)

type ExecutionContext struct {
	PrincipalID string         `json:"principal"`
	GameID      string         `json:"game"`
	SessionID   string         `json:"session"`
	Origin      string         `json:"origin"`
	Attributes  map[string]any `json:"attributes"`
}
type executionKey struct{}

func WithExecution(ctx context.Context, e ExecutionContext) (context.Context, error) {
	data, err := json.Marshal(e)
	if err != nil {
		return nil, fmt.Errorf("execution context: %w", err)
	}
	var snapshot ExecutionContext
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return nil, err
	}
	return context.WithValue(ctx, executionKey{}, snapshot), nil
}
func Execution(ctx context.Context) ExecutionContext {
	e, _ := ctx.Value(executionKey{}).(ExecutionContext)
	return e
}
func WithPrincipal(ctx context.Context, id string) context.Context {
	e := Execution(ctx)
	e.PrincipalID = id
	return context.WithValue(ctx, executionKey{}, e)
}
func Principal(ctx context.Context) string { return Execution(ctx).PrincipalID }
func WithOrigin(ctx context.Context, origin string) context.Context {
	e := Execution(ctx)
	e.Origin = origin
	return context.WithValue(ctx, executionKey{}, e)
}
