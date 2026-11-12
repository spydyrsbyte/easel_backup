package server

import (
	"context"
	"encoding/json"

	"easel/internal/accounts"
	"easel/internal/jsapi"
	"easel/internal/security"
)

func SignedInClient(ctx context.Context, _ string, _ json.RawMessage, _ bool) error {
	if security.Principal(ctx) == "" {
		return security.ErrDenied
	}
	return nil
}

type scriptedUsers struct{ accounts *accounts.Service }

func (s scriptedUsers) List(ctx context.Context) (any, error) {
	rows, err := s.accounts.Pool.Query(ctx, `SELECT u.user_id::text,u.display_name,a.user_id IS NOT NULL FROM accounts.users u LEFT JOIN accounts.administrators a USING(user_id) ORDER BY u.display_name,u.user_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []map[string]any{}
	for rows.Next() {
		var id, name string
		var admin bool
		if err := rows.Scan(&id, &name, &admin); err != nil {
			return nil, err
		}
		users = append(users, map[string]any{"id": id, "displayName": name, "admin": admin})
	}
	return users, rows.Err()
}

func ScriptedUsers(service *accounts.Service) jsapi.ServerUsers { return scriptedUsers{service} }

func (s scriptedUsers) Get(ctx context.Context, id string) (any, error) {
	user, admin, err := s.accounts.Account(ctx, id)
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": user.ID, "displayName": user.DisplayName, "admin": admin}, nil
}

func (s scriptedUsers) Admins(ctx context.Context) (any, error) { return s.accounts.Admins(ctx) }

func (s scriptedUsers) SetAdmin(ctx context.Context, id string, admin bool) error {
	return s.accounts.SetAdmin(ctx, id, admin)
}
