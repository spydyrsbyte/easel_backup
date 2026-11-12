package automation

import "context"

type environmentKey struct{}

func WithEnvironment(ctx context.Context, values map[string]any) context.Context {
	copy := make(map[string]any, len(values))
	for key, value := range values {
		copy[key] = value
	}
	return context.WithValue(ctx, environmentKey{}, copy)
}
