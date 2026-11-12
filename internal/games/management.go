package games

import (
	"context"
	"fmt"

	"easel/internal/automation"
	"easel/internal/events"
	"easel/internal/security"
)

type hostedAutomationAccess struct {
	service *security.SecurityService
	request func(string, automation.Saved) (security.AuthorizationRequest, error)
}

func (a hostedAutomationAccess) Authorize(ctx context.Context, action string, saved automation.Saved) error {
	if security.Execution(ctx).Origin == events.Server.String() && security.Principal(ctx) == "" && saved.Creator.Kind == automation.CreatorSystem {
		return nil
	}
	return (security.AutomationAccess{Service: a.service, Request: a.request}).Authorize(ctx, action, saved)
}

func (m *Manager) Roles(ctx context.Context, id string) (any, error) {
	if !validID(id) {
		return nil, ErrUnknownGame
	}
	var exists bool
	if err := m.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_data.games WHERE game_id=$1)`, id).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrUnknownGame
	}
	rows, err := m.Pool.Query(ctx, `SELECT u.user_id::text,u.display_name,coalesce(p.attributes->>'role','player') FROM game_data.members m JOIN accounts.users u USING(user_id) LEFT JOIN game_data.security_principals p ON p.game_id=m.game_id AND p.id=m.user_id WHERE m.game_id=$1 ORDER BY u.display_name,u.user_id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	members := []map[string]any{}
	for rows.Next() {
		var user, name, role string
		if err := rows.Scan(&user, &name, &role); err != nil {
			return nil, err
		}
		members = append(members, map[string]any{"id": user, "displayName": name, "role": role})
	}
	return members, rows.Err()
}

func (m *Manager) SetRole(ctx context.Context, id, user, role string) error {
	if role != "administrator" && role != "player" && role != "spectator" {
		return fmt.Errorf("unknown game role")
	}
	if !validID(id) || !validID(user) {
		return ErrUnknownUser
	}
	result, err := m.Pool.Exec(ctx, `UPDATE game_data.security_principals p SET attributes=jsonb_set(attributes,'{role}',to_jsonb($3::text)) WHERE game_id=$1 AND id=$2 AND EXISTS(SELECT 1 FROM game_data.members m WHERE m.game_id=p.game_id AND m.user_id=p.id)`, id, user, role)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("user must join the game before receiving a role")
	}
	if runtime, running := m.runtime(id); running {
		return runtime.EmitServer(ctx, "Users.Changed", []byte(`{}`))
	}
	return nil
}

func (s scriptedGames) Roles(ctx context.Context, id string) (any, error) {
	return s.manager.Roles(ctx, id)
}
func (s scriptedGames) SetRole(ctx context.Context, id, user, role string) error {
	return s.manager.SetRole(ctx, id, user, role)
}
