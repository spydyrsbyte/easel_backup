package pgstore

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"easel/internal/manifest"
	"easel/internal/schema"
	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func (revisions *Revisions) LoadSchema(ctx context.Context, gameID string) (string, []schema.Contribution, *schema.Schema, error) {
	tx, err := revisions.Pool.Begin(ctx)
	if err != nil {
		return "", nil, nil, err
	}
	defer tx.Rollback(context.Background())
	var revision *string
	if err := tx.QueryRow(ctx, `SELECT active_revision_id::text FROM game_data.games WHERE game_id=$1 FOR SHARE`, gameID).Scan(&revision); err != nil {
		return "", nil, nil, err
	}
	if revision == nil {
		return "", nil, nil, fmt.Errorf("game has no active schema")
	}
	rules, err := savedRules(ctx, tx, gameID, *revision)
	if err != nil {
		return "", nil, nil, err
	}
	composed, err := schema.ComposeRules(rules)
	return *revision, rules, composed, err
}

func savedRules(ctx context.Context, tx pgx.Tx, gameID, revision string) ([]schema.Contribution, error) {
	rows, err := tx.Query(ctx, `SELECT c.name,c.kind,s.name,v.package_version,r.payload_bson
 FROM game_data.revision_contributions r
 JOIN game_data.schema_contributions s USING(game_id,contribution_id,record_type_id,contributor_id)
 JOIN game_data.contributors c USING(game_id,contributor_id)
 JOIN game_data.revision_contributors v USING(game_id,revision_id,contributor_id)
 WHERE r.game_id=$1 AND r.revision_id=$2 ORDER BY v.load_position,r.contribution_order`, gameID, revision)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rules := []schema.Contribution{}
	for rows.Next() {
		var name, kind, source, version string
		var payload []byte
		if err := rows.Scan(&name, &kind, &source, &version, &payload); err != nil {
			return nil, err
		}
		parts := strings.Split(name, ".")
		if len(parts) != 3 {
			return nil, fmt.Errorf("invalid saved contributor %s", name)
		}
		var document bson.M
		if err := bson.Unmarshal(payload, &document); err != nil {
			return nil, err
		}
		normalized, err := normalizeBSON(document)
		if err != nil {
			return nil, err
		}
		raw, err := json.Marshal(normalized)
		if err != nil {
			return nil, err
		}
		declaration, err := schema.ParseDeclaration(raw)
		if err != nil {
			return nil, fmt.Errorf("read saved schema %s/%s: %w", name, source, err)
		}
		declaration.Source = source
		pkg := manifest.Package{Manifest: manifest.Manifest{Owner: parts[0], Host: parts[1], Name: parts[2], Type: kind}}
		if _, err := fmt.Sscanf(version, "%d.%d.%d", &pkg.Manifest.Version.Major, &pkg.Manifest.Version.Minor, &pkg.Manifest.Version.Revision); err != nil {
			return nil, fmt.Errorf("invalid saved version of %s: %w", name, err)
		}
		rules = append(rules, schema.Contribution{Package: pkg, Declaration: declaration})
	}
	return rules, rows.Err()
}

func (p *publication) retainContributors(parent *string, installed int) error {
	if parent == nil {
		return nil
	}
	_, err := p.tx.Exec(p.ctx, `INSERT INTO game_data.revision_contributors
 (game_id,revision_id,contributor_id,contributor_kind,load_position,package_version,package_sha256)
 SELECT old.game_id,$3,old.contributor_id,old.contributor_kind,
 $4::integer+row_number() OVER (ORDER BY old.load_position)-1,old.package_version,old.package_sha256
 FROM game_data.revision_contributors old
 WHERE old.game_id=$1 AND old.revision_id=$2 AND NOT EXISTS (
 SELECT 1 FROM game_data.revision_contributors current
 WHERE current.game_id=old.game_id AND current.revision_id=$3 AND current.contributor_id=old.contributor_id)`, p.gameID, *parent, p.revisionID, installed)
	if err != nil {
		return err
	}
	rows, err := p.tx.Query(p.ctx, `SELECT c.name,c.contributor_id::text FROM game_data.contributors c
 JOIN game_data.revision_contributors r USING(game_id,contributor_id) WHERE r.game_id=$1 AND r.revision_id=$2`, p.gameID, p.revisionID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var name, id string
		if err := rows.Scan(&name, &id); err != nil {
			return err
		}
		p.contributors[name] = id
	}
	return rows.Err()
}

func (p *publication) validateRecords(composed *schema.Schema, parent *string) error {
	if parent == nil {
		return nil
	}
	rows, err := p.tx.Query(p.ctx, `SELECT r.record_id::text,t.name FROM game_data.records r
 JOIN game_data.record_types t USING(game_id,record_type_id) WHERE r.game_id=$1 ORDER BY r.record_id`, p.gameID)
	if err != nil {
		return err
	}
	type saved struct{ id, name string }
	records := []saved{}
	for rows.Next() {
		var record saved
		if err := rows.Scan(&record.id, &record.name); err != nil {
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
	for _, record := range records {
		data := map[string]any{}
		storage := &recordStorage{owners: map[string]string{}, fragments: map[string]bson.M{}}
		if err := readFragments(p.ctx, p.tx, p.gameID, *parent, record.id, storage, data); err != nil {
			return err
		}
		if err := composed.ValidateWith(record.name, data, func(id string) (string, error) {
			return recordType(p.ctx, p.tx, p.gameID, id)
		}); err != nil {
			return fmt.Errorf("schema requires an explicit migration for record %s: %w", record.id, err)
		}
	}
	return nil
}
