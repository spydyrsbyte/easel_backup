package pgstore

import (
	"context"
	"fmt"

	"easel/internal/automation"
	"easel/internal/manifest"
	"easel/internal/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type SchemaMigration struct {
	FromRevision string
	Rules        []schema.Contribution
	Transform    func(context.Context, automation.Record) (*automation.Record, error)
}

func (revisions *Revisions) Migrate(ctx context.Context, gameID string, plan manifest.Plan, migration SchemaMigration) (string, *schema.Schema, error) {
	if migration.FromRevision == "" {
		return "", nil, fmt.Errorf("schema migration requires its source revision")
	}
	if migration.Transform == nil {
		return "", nil, fmt.Errorf("schema migration requires an explicit record transformation")
	}
	composed := &schema.Schema{}
	revision, err := revisions.publish(ctx, gameID, plan, composed, &migration)
	if err != nil {
		return "", nil, err
	}
	return revision, composed, nil
}

func (p *publication) migrateRecords(composed *schema.Schema, parent *string, migration *SchemaMigration) error {
	if parent == nil {
		return nil
	}
	rows, err := p.tx.Query(p.ctx, `SELECT r.record_id::text,t.name,r.record_version FROM game_data.records r
 JOIN game_data.record_types t USING(game_id,record_type_id) WHERE r.game_id=$1 ORDER BY r.record_id FOR UPDATE OF r`, p.gameID)
	if err != nil {
		return err
	}
	records := []automation.Record{}
	for rows.Next() {
		var record automation.Record
		if err := rows.Scan(&record.ID, &record.Type, &record.Version); err != nil {
			rows.Close()
			return err
		}
		records = append(records, record)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	transaction := &postgresTransaction{store: &Records{GameID: p.gameID, Schema: composed}, tx: p.tx, revision: p.revisionID}
	for _, original := range records {
		original.Data = map[string]any{}
		storage := &recordStorage{owners: map[string]string{}, fragments: map[string]bson.M{}, version: original.Version}
		if err := readFragments(p.ctx, p.tx, p.gameID, *parent, original.ID, storage, original.Data); err != nil {
			return err
		}
		converted, err := migration.Transform(p.ctx, original)
		if err != nil {
			return fmt.Errorf("migrate record %s: %w", original.ID, err)
		}
		if converted == nil {
			if _, err := p.tx.Exec(p.ctx, `DELETE FROM game_data.records WHERE game_id=$1 AND record_id=$2`, p.gameID, original.ID); err != nil {
				return err
			}
			continue
		}
		if converted.ID != original.ID || converted.Version != original.Version {
			return fmt.Errorf("migration must preserve record identity and version for %s", original.ID)
		}
		if err := composed.Validate(converted.Type, converted.Data); err != nil {
			return fmt.Errorf("migrate record %s: %w", original.ID, err)
		}
		if converted.Type != original.Type {
			if _, err := p.tx.Exec(p.ctx, `UPDATE game_data.records SET record_type_id=$3,last_validated_revision_id=$4 WHERE game_id=$1 AND record_id=$2`, p.gameID, original.ID, p.recordTypes[converted.Type], p.revisionID); err != nil {
				return err
			}
		}
		storage.owners = map[string]string{}
		if err := transaction.writeFragments(p.ctx, *converted, storage); err != nil {
			return err
		}
	}
	return p.validateRecords(composed, &p.revisionID)
}
