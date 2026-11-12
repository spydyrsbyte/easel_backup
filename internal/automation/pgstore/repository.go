package pgstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"easel/internal/automation"
	"easel/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	Pool   *pgxpool.Pool
	GameID string

	AuthorizeWrite func(context.Context, pgx.Tx, string, automation.Saved) error
}

func (repository *Repository) AuthorizesWrites() bool { return repository.AuthorizeWrite != nil }

func (repository *Repository) Save(ctx context.Context, saved automation.Saved) error {
	if err := automation.Validate(saved.Definition); err != nil {
		return err
	}
	if err := saved.Creator.Validate(); err != nil {
		return err
	}
	name := saved.Definition.Name
	data, err := json.Marshal(saved.Definition)
	if err != nil {
		return fmt.Errorf("encode automation %s: %w", name, err)
	}
	if repository.AuthorizeWrite == nil {
		return fmt.Errorf("automation write authorization is not configured")
	}
	tx, err := database.BeginSerializable(ctx, repository.Pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if err := repository.AuthorizeWrite(ctx, tx, "save", saved); err != nil {
		return err
	}
	command, err := tx.Exec(ctx, `INSERT INTO game_data.automations (game_id,name,creator_kind,creator_id,definition)
 VALUES ($1,$2,$3,$4,$5) ON CONFLICT (game_id,name) DO UPDATE
 SET definition=EXCLUDED.definition, updated_at=now()
 WHERE game_data.automations.creator_kind=EXCLUDED.creator_kind AND game_data.automations.creator_id=EXCLUDED.creator_id`, repository.GameID, name, saved.Creator.Kind, saved.Creator.ID, data)
	if err != nil {
		return fmt.Errorf("save automation %s: %w", name, err)
	}
	if command.RowsAffected() != 1 {
		return fmt.Errorf("automation belongs to another creator")
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit automation %s: %w", name, err)
	}
	return nil
}

func (repository *Repository) Load(ctx context.Context, name string) (automation.Saved, error) {
	var saved automation.Saved
	var data []byte
	err := repository.Pool.QueryRow(ctx, `SELECT creator_kind,creator_id,definition FROM game_data.automations WHERE game_id=$1 AND name=$2`, repository.GameID, name).Scan(&saved.Creator.Kind, &saved.Creator.ID, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return automation.Saved{}, fmt.Errorf("%w: %s", automation.ErrNotFound, name)
	}
	if err != nil {
		return automation.Saved{}, fmt.Errorf("load automation %s: %w", name, err)
	}
	if err := automation.Decode(data, &saved.Definition); err != nil {
		return automation.Saved{}, fmt.Errorf("decode automation %s: %w", name, err)
	}
	return saved, automation.Validate(saved.Definition)
}

func (repository *Repository) List(ctx context.Context) ([]automation.Saved, error) {
	rows, err := repository.Pool.Query(ctx, `SELECT creator_kind,creator_id,definition FROM game_data.automations WHERE game_id=$1 ORDER BY name`, repository.GameID)
	if err != nil {
		return nil, fmt.Errorf("list automations: %w", err)
	}
	defer rows.Close()
	result := []automation.Saved{}
	for rows.Next() {
		var saved automation.Saved
		var data []byte
		if err := rows.Scan(&saved.Creator.Kind, &saved.Creator.ID, &data); err != nil {
			return nil, fmt.Errorf("scan automation: %w", err)
		}
		if err := automation.Decode(data, &saved.Definition); err != nil {
			return nil, fmt.Errorf("decode listed automation: %w", err)
		}
		if err := automation.Validate(saved.Definition); err != nil {
			return nil, fmt.Errorf("validate automation %s: %w", saved.Definition.Name, err)
		}
		result = append(result, saved)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list automations: %w", err)
	}
	return result, nil
}

func (repository *Repository) Delete(ctx context.Context, name string) error {
	if repository.AuthorizeWrite == nil {
		return fmt.Errorf("automation write authorization is not configured")
	}
	tx, err := database.BeginSerializable(ctx, repository.Pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var saved automation.Saved
	var data []byte
	if err := tx.QueryRow(ctx, `SELECT creator_kind,creator_id,definition FROM game_data.automations WHERE game_id=$1 AND name=$2 FOR UPDATE`, repository.GameID, name).Scan(&saved.Creator.Kind, &saved.Creator.ID, &data); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("%w: %s", automation.ErrNotFound, name)
		}
		return fmt.Errorf("lock automation %s: %w", name, err)
	}
	if err := automation.Decode(data, &saved.Definition); err != nil {
		return fmt.Errorf("decode automation %s: %w", name, err)
	}
	if err := repository.AuthorizeWrite(ctx, tx, "delete", saved); err != nil {
		return err
	}
	command, err := tx.Exec(ctx, `DELETE FROM game_data.automations WHERE game_id=$1 AND name=$2`, repository.GameID, name)
	if err != nil {
		return fmt.Errorf("delete automation %s: %w", name, err)
	}
	if command.RowsAffected() == 0 {
		return fmt.Errorf("%w: %s", automation.ErrNotFound, name)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit automation %s: %w", name, err)
	}
	return nil
}
