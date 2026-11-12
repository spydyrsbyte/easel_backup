package security

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"easel/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EntityResolver func(context.Context, pgx.Tx, string, string) (Entity, error)

type PostgresStore struct {
	Pool          *pgxpool.Pool
	GameID        string
	ResolveRecord EntityResolver
}

func (s *PostgresStore) GameScope() string { return s.GameID }

type PostgresTransaction struct {
	Tx    pgx.Tx
	store *PostgresStore
}

func (s *PostgresStore) ViewTransaction(tx pgx.Tx) View { return &PostgresTransaction{tx, s} }

func (s *PostgresStore) Begin(ctx context.Context) (Transaction, error) {
	if s.Pool == nil || s.GameID == "" || s.ResolveRecord == nil {
		return nil, fmt.Errorf("security PostgreSQL store requires pool, game and authoritative record resolver")
	}
	tx, err := database.BeginSerializable(ctx, s.Pool)
	if err != nil {
		return nil, err
	}
	return &PostgresTransaction{tx, s}, nil
}

func (s *PostgresStore) CheckRegistry(ctx context.Context, build, fingerprint string) error {
	if build == "" || fingerprint == "" {
		return fmt.Errorf("build and registry fingerprint are required")
	}
	command, err := s.Pool.Exec(ctx, `INSERT INTO game_data.security_registries(game_id,build_id,fingerprint) VALUES($1,$2,$3)
 ON CONFLICT (game_id) DO UPDATE SET build_id=EXCLUDED.build_id
 WHERE game_data.security_registries.fingerprint=EXCLUDED.fingerprint`, s.GameID, build, fingerprint)
	if err != nil {
		return fmt.Errorf("record security registry for build %s: %w", build, err)
	}
	if command.RowsAffected() == 1 {
		return nil
	}
	var registered string
	if err := s.Pool.QueryRow(ctx, `SELECT build_id FROM game_data.security_registries WHERE game_id=$1`, s.GameID).Scan(&registered); err != nil {
		return fmt.Errorf("read security registry: %w", err)
	}
	return fmt.Errorf("incompatible security registry for build %s: game is registered by build %s", build, registered)
}

func (t *PostgresTransaction) QueryAssignments(ctx context.Context, ids []string, resource string) ([]Assignment, error) {
	rows, err := t.Tx.Query(ctx, `SELECT principal_id::text,permission,coalesce(resource_id::text,''),effect FROM game_data.security_assignments WHERE game_id=$1 AND principal_id=ANY($2::uuid[]) AND (resource_id IS NULL OR resource_id=nullif($3,'')::uuid) ORDER BY permission,principal_id,resource_id LIMIT $4`, t.store.GameID, ids, resource, maxQueryRows+1)
	if err != nil {
		return nil, fmt.Errorf("query security assignments: %w", err)
	}
	defer rows.Close()
	out := []Assignment{}
	for rows.Next() {
		var a Assignment
		if err := rows.Scan(&a.PrincipalID, &a.Permission, &a.ResourceID, &a.Effect); err != nil {
			return nil, fmt.Errorf("scan security assignment: %w", err)
		}
		out = append(out, a)
		if len(out) > maxQueryRows {
			return nil, fmt.Errorf("permission assignment budget exceeded")
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("query security assignments: %w", err)
	}
	return out, nil
}
func (t *PostgresTransaction) SetAssignment(ctx context.Context, a Assignment) error {
	_, err := t.Tx.Exec(ctx, `INSERT INTO game_data.security_assignments(game_id,principal_id,permission,resource_id,effect) VALUES($1,$2,$3,nullif($4,'')::uuid,$5) ON CONFLICT(game_id,principal_id,permission,resource_id) DO UPDATE SET effect=EXCLUDED.effect`, t.store.GameID, a.PrincipalID, a.Permission, a.ResourceID, a.Effect)
	if err != nil {
		return fmt.Errorf("set security assignment %s for %s: %w", a.Permission, a.PrincipalID, err)
	}
	return nil
}
func (t *PostgresTransaction) RemoveAssignment(ctx context.Context, a Assignment) error {
	_, err := t.Tx.Exec(ctx, `DELETE FROM game_data.security_assignments WHERE game_id=$1 AND principal_id=$2 AND permission=$3 AND resource_id IS NOT DISTINCT FROM nullif($4,'')::uuid`, t.store.GameID, a.PrincipalID, a.Permission, a.ResourceID)
	if err != nil {
		return fmt.Errorf("remove security assignment %s for %s: %w", a.Permission, a.PrincipalID, err)
	}
	return nil
}
func (t *PostgresTransaction) CreateGroup(ctx context.Context, e Entity) error {
	data, err := json.Marshal(e.Attributes)
	if err != nil {
		return fmt.Errorf("encode group %s attributes: %w", e.ID, err)
	}
	if e.Attributes == nil {
		data = []byte(`{}`)
	}
	_, err = t.Tx.Exec(ctx, `INSERT INTO game_data.security_principals(game_id,id,principal_type,attributes) VALUES($1,$2,$3,$4)`, t.store.GameID, e.ID, e.Type, data)
	if err != nil {
		return fmt.Errorf("create group %s: %w", e.ID, err)
	}
	return nil
}
func (t *PostgresTransaction) DeleteGroup(ctx context.Context, id string) error {
	if _, err := t.Tx.Exec(ctx, `DELETE FROM game_data.security_relationships WHERE game_id=$1 AND object_id=$2`, t.store.GameID, id); err != nil {
		return fmt.Errorf("delete relationships of group %s: %w", id, err)
	}
	if _, err := t.Tx.Exec(ctx, `DELETE FROM game_data.security_assignments WHERE game_id=$1 AND resource_id=$2`, t.store.GameID, id); err != nil {
		return fmt.Errorf("delete assignments on group %s: %w", id, err)
	}
	if _, err := t.Tx.Exec(ctx, `DELETE FROM game_data.security_principals WHERE game_id=$1 AND id=$2`, t.store.GameID, id); err != nil {
		return fmt.Errorf("delete group %s: %w", id, err)
	}
	return nil
}

func (t *PostgresTransaction) ResolvePrincipal(ctx context.Context, id string) (Entity, error) {
	entity := Entity{ID: id}
	var data []byte
	err := t.Tx.QueryRow(ctx, `SELECT principal_type,attributes FROM game_data.security_principals WHERE game_id=$1 AND id=$2`, t.store.GameID, id).Scan(&entity.Type, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entity{}, fmt.Errorf("%w: principal %s", ErrNotFound, id)
	}
	if err != nil {
		return Entity{}, fmt.Errorf("resolve principal %s: %w", id, err)
	}
	if err := json.Unmarshal(data, &entity.Attributes); err != nil {
		return entity, fmt.Errorf("decode principal %s attributes: %w", id, err)
	}
	return entity, nil
}
func (t *PostgresTransaction) ResolveEntity(ctx context.Context, id string) (Entity, error) {
	entity, err := t.ResolvePrincipal(ctx, id)
	if err == nil {
		return entity, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return Entity{}, err
	}
	entity, err = t.store.ResolveRecord(ctx, t.Tx, t.store.GameID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entity{}, fmt.Errorf("%w: entity %s", ErrNotFound, id)
	}
	if err != nil {
		return Entity{}, fmt.Errorf("resolve record %s: %w", id, err)
	}
	return entity, nil
}
func (t *PostgresTransaction) HasRelationship(ctx context.Context, subject, relation, object string) (bool, error) {
	var found bool
	err := t.Tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_data.security_relationships WHERE game_id=$1 AND subject_id=$2 AND relation=$3 AND object_id=$4)`, t.store.GameID, subject, relation, object).Scan(&found)
	if err != nil {
		return false, fmt.Errorf("check relationship %s %s %s: %w", subject, relation, object, err)
	}
	return found, nil
}
func (t *PostgresTransaction) QueryRelationships(ctx context.Context, subject, relation string) ([]Relationship, error) {
	rows, err := t.Tx.Query(ctx, `SELECT subject_id::text,relation,object_id::text FROM game_data.security_relationships WHERE game_id=$1 AND subject_id=$2 AND relation=$3 ORDER BY object_id LIMIT $4`, t.store.GameID, subject, relation, maxQueryRows+1)
	if err != nil {
		return nil, fmt.Errorf("query relationships %s %s: %w", subject, relation, err)
	}
	defer rows.Close()
	result := []Relationship{}
	for rows.Next() {
		var r Relationship
		if err := rows.Scan(&r.SubjectID, &r.Relation, &r.ObjectID); err != nil {
			return nil, fmt.Errorf("scan relationship: %w", err)
		}
		result = append(result, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("query relationships %s %s: %w", subject, relation, err)
	}
	return result, nil
}

func (t *PostgresTransaction) AddRelationship(ctx context.Context, r Relationship) error {
	_, err := t.Tx.Exec(ctx, `INSERT INTO game_data.security_relationships(game_id,subject_id,relation,object_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, t.store.GameID, r.SubjectID, r.Relation, r.ObjectID)
	if err != nil {
		return fmt.Errorf("add relationship %s %s %s: %w", r.SubjectID, r.Relation, r.ObjectID, err)
	}
	return nil
}
func (t *PostgresTransaction) RemoveRelationship(ctx context.Context, r Relationship) error {
	_, err := t.Tx.Exec(ctx, `DELETE FROM game_data.security_relationships WHERE game_id=$1 AND subject_id=$2 AND relation=$3 AND object_id=$4`, t.store.GameID, r.SubjectID, r.Relation, r.ObjectID)
	if err != nil {
		return fmt.Errorf("remove relationship %s %s %s: %w", r.SubjectID, r.Relation, r.ObjectID, err)
	}
	return nil
}
func (t *PostgresTransaction) Commit(ctx context.Context) error {
	if err := t.Tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit security transaction: %w", err)
	}
	return nil
}
func (t *PostgresTransaction) Rollback(ctx context.Context) error { return t.Tx.Rollback(ctx) }

func RecordResolver(view func(context.Context, pgx.Tx, string, string) (string, map[string]any, error)) EntityResolver {
	return func(ctx context.Context, tx pgx.Tx, game, id string) (Entity, error) {
		typeName, data, err := view(ctx, tx, game, id)
		if err != nil {
			return Entity{}, err
		}
		return Entity{ID: id, Type: typeName, Attributes: data}, nil
	}
}
