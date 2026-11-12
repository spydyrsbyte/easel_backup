package pgstore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"

	"easel/internal/database"
	"easel/internal/manifest"
	"easel/internal/schema"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	schemaFormat    = "easel.data/1"
	composerVersion = "easel.composer/1"
)

type Revisions struct {
	Pool *pgxpool.Pool
}

func (revisions *Revisions) CreateGame(ctx context.Context, name string, application manifest.Package) (string, error) {
	return revisions.CreateStorage(ctx, database.DefaultServerID, "game", name, application)
}

func (revisions *Revisions) CreateStorage(ctx context.Context, serverID, kind, name string, application manifest.Package) (string, error) {
	if application.Manifest.Type != manifest.TypeApplication {
		return "", fmt.Errorf("package %s is not an application", application.ID())
	}
	tx, err := database.BeginSerializable(ctx, revisions.Pool)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	var gameID, applicationID string
	if err := tx.QueryRow(ctx, `INSERT INTO game_data.games(name,application_id,server_id,kind) VALUES($1,gen_random_uuid(),$2,$3) RETURNING game_id::text,application_id::text`, name, database.ServerID(serverID), kind).Scan(&gameID, &applicationID); err != nil {
		return "", fmt.Errorf("create game %s: %w", name, err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO game_data.contributors(game_id,contributor_id,kind,name) VALUES($1,$2,'application',$3)`, gameID, applicationID, application.ID()); err != nil {
		return "", fmt.Errorf("register application %s: %w", application.ID(), err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit game %s: %w", name, err)
	}
	return gameID, nil
}

type publication struct {
	ctx          context.Context
	tx           pgx.Tx
	gameID       string
	revisionID   string
	contributors map[string]string
	recordTypes  map[string]string
	definitions  map[string]string
}

func (revisions *Revisions) Publish(ctx context.Context, gameID string, plan manifest.Plan, composed *schema.Schema) (string, error) {
	return revisions.publish(ctx, gameID, plan, composed, nil)
}

func (revisions *Revisions) Preview(ctx context.Context, gameID string, plan manifest.Plan) error {
	_, err := revisions.publishWith(ctx, gameID, plan, &schema.Schema{}, nil, true)
	if errors.Is(err, ErrDryRun) {
		return nil
	}
	return err
}

func (revisions *Revisions) publish(ctx context.Context, gameID string, plan manifest.Plan, composed *schema.Schema, migration *SchemaMigration) (string, error) {
	return revisions.publishWith(ctx, gameID, plan, composed, migration, migration != nil && migration.DryRun)
}

func (revisions *Revisions) publishWith(ctx context.Context, gameID string, plan manifest.Plan, composed *schema.Schema, migration *SchemaMigration, dry bool) (string, error) {
	tx, err := database.BeginSerializable(ctx, revisions.Pool)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	p := &publication{ctx: ctx, tx: tx, gameID: gameID, contributors: map[string]string{}, recordTypes: map[string]string{}, definitions: map[string]string{}}
	var application string
	var parent *string
	if err := tx.QueryRow(ctx, `SELECT c.name,g.active_revision_id::text FROM game_data.games g JOIN game_data.contributors c ON c.game_id=g.game_id AND c.contributor_id=g.application_id WHERE g.game_id=$1 FOR UPDATE OF g`, gameID).Scan(&application, &parent); err != nil {
		return "", fmt.Errorf("read game %s: %w", gameID, err)
	}
	if application != plan.Application.ID() {
		return "", fmt.Errorf("game %s runs application %s, not %s", gameID, application, plan.Application.ID())
	}
	if migration != nil && (parent == nil || *parent != migration.FromRevision) {
		return "", fmt.Errorf("schema migration source revision is no longer active")
	}
	saved := []schema.Contribution{}
	if parent != nil {
		saved, err = savedRules(ctx, tx, gameID, *parent)
		if err != nil {
			return "", err
		}
	}
	var rules []schema.Contribution
	var effective *schema.Schema
	if migration == nil {
		rules, effective, err = schema.RetainRules(saved, plan.Packages)
	} else {
		rules = migration.Rules
		effective, err = schema.ComposeRules(rules)
	}
	if err != nil {
		return "", err
	}
	if migration == nil {
		if err := p.validateRecords(effective, parent); err != nil {
			return "", err
		}
	}
	hashes, digest, err := packageDigest(plan)
	if err != nil {
		return "", err
	}
	if err := tx.QueryRow(ctx, `INSERT INTO game_data.contract_revisions(game_id,parent_revision_id,schema_format,composer_version,manifest_sha256) VALUES($1,$2::uuid,$3,$4,$5) RETURNING revision_id::text`, gameID, parent, schemaFormat, composerVersion, digest).Scan(&p.revisionID); err != nil {
		return "", fmt.Errorf("create revision of game %s: %w", gameID, err)
	}
	for position, pkg := range plan.Packages {
		if err := p.contributor(pkg, position, hashes[pkg.ID()]); err != nil {
			return "", err
		}
	}
	if err := p.retainContributors(parent, len(plan.Packages)); err != nil {
		return "", err
	}
	for _, name := range effective.Names() {
		recordType := effective.Types[name]
		if p.contributors[recordType.Owner] == "" {
			return "", fmt.Errorf("unknown contributor %s for record type %s", recordType.Owner, name)
		}
		var id string
		if err := tx.QueryRow(ctx, `INSERT INTO game_data.record_types(game_id,name,introduced_by) VALUES($1,$2,$3) ON CONFLICT(game_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING record_type_id::text`, gameID, name, p.contributors[recordType.Owner]).Scan(&id); err != nil {
			return "", fmt.Errorf("register record type %s: %w", name, err)
		}
		p.recordTypes[name] = id
	}
	if err := p.contributions(rules); err != nil {
		return "", err
	}
	for _, name := range effective.Names() {
		document, err := effective.Types[name].JSON()
		if err != nil {
			return "", fmt.Errorf("encode effective schema %s: %w", name, err)
		}
		payload, err := jsonToBSON(document)
		if err != nil {
			return "", fmt.Errorf("encode effective schema %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO game_data.effective_schemas(game_id,revision_id,record_type_id,payload_bson) VALUES($1,$2,$3,$4)`, gameID, p.revisionID, p.recordTypes[name], payload); err != nil {
			return "", fmt.Errorf("store effective schema %s: %w", name, err)
		}
	}
	if migration != nil {
		if err := p.migrateRecords(effective, parent, migration); err != nil {
			return "", err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE game_data.contract_revisions SET sealed_at=now() WHERE game_id=$1 AND revision_id=$2`, gameID, p.revisionID); err != nil {
		return "", fmt.Errorf("seal revision %s: %w", p.revisionID, err)
	}
	if _, err := tx.Exec(ctx, `UPDATE game_data.games SET active_revision_id=$2 WHERE game_id=$1`, gameID, p.revisionID); err != nil {
		return "", fmt.Errorf("activate revision %s: %w", p.revisionID, err)
	}
	if dry {
		return "", ErrDryRun
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit revision %s: %w", p.revisionID, err)
	}
	*composed = *effective
	return p.revisionID, nil
}

func packageDigest(plan manifest.Plan) (map[string][32]byte, []byte, error) {
	digest := sha256.New()
	hashes := map[string][32]byte{}
	for _, pkg := range plan.Packages {
		hash, err := pkg.Hash()
		if err != nil {
			return nil, nil, err
		}
		hashes[pkg.ID()] = hash
		digest.Write([]byte(pkg.ID()))
		digest.Write([]byte{0})
		digest.Write(hash[:])
	}
	return hashes, digest.Sum(nil), nil
}

func (revisions *Revisions) CurrentRevision(ctx context.Context, gameID string, plan manifest.Plan, composed *schema.Schema) (string, error) {
	_, digest, err := packageDigest(plan)
	if err != nil {
		return "", err
	}
	var active *string
	var published []byte
	if err := revisions.Pool.QueryRow(ctx, `SELECT g.active_revision_id::text,r.manifest_sha256 FROM game_data.games g LEFT JOIN game_data.contract_revisions r ON r.game_id=g.game_id AND r.revision_id=g.active_revision_id WHERE g.game_id=$1`, gameID).Scan(&active, &published); err != nil {
		return "", fmt.Errorf("read active revision of game %s: %w", gameID, err)
	}
	if active != nil && bytes.Equal(published, digest) {
		tx, err := revisions.Pool.Begin(ctx)
		if err != nil {
			return "", err
		}
		defer tx.Rollback(context.Background())
		rules, err := savedRules(ctx, tx, gameID, *active)
		if err != nil {
			return "", err
		}
		effective, err := schema.ComposeRules(rules)
		if err != nil {
			return "", err
		}
		*composed = *effective
		return *active, nil
	}
	return revisions.Publish(ctx, gameID, plan, composed)
}

func (p *publication) contributor(pkg manifest.Package, position int, hash [32]byte) error {
	var id, kind string
	err := p.tx.QueryRow(p.ctx, `INSERT INTO game_data.contributors(game_id,kind,name) VALUES($1,$2,$3) ON CONFLICT(game_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING contributor_id::text,kind`, p.gameID, pkg.Manifest.Type, pkg.ID()).Scan(&id, &kind)
	if err != nil {
		return fmt.Errorf("register contributor %s: %w", pkg.ID(), err)
	}
	if kind != pkg.Manifest.Type {
		return fmt.Errorf("contributor %s was registered as a %s, not a %s", pkg.ID(), kind, pkg.Manifest.Type)
	}
	p.contributors[pkg.ID()] = id
	if _, err := p.tx.Exec(p.ctx, `INSERT INTO game_data.revision_contributors(game_id,revision_id,contributor_id,contributor_kind,load_position,package_version,package_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)`, p.gameID, p.revisionID, id, kind, position, pkg.Manifest.Version.String(), hash[:]); err != nil {
		return fmt.Errorf("add %s to revision: %w", pkg.ID(), err)
	}
	return nil
}

func (p *publication) contributions(rules []schema.Contribution) error {
	type pending struct {
		pkg         manifest.Package
		declaration schema.Declaration
		target      string
	}
	defines, modifies := []pending{}, []pending{}
	for _, rule := range rules {
		pkg, declaration := rule.Package, rule.Declaration
		if declaration.Name != "" {
			defines = append(defines, pending{pkg, declaration, schema.Qualify(pkg.Manifest.Namespace(), declaration.Name)})
		} else {
			modifies = append(modifies, pending{pkg, declaration, schema.Qualify(pkg.Manifest.Namespace(), declaration.Modify)})
		}
	}
	order := map[string]int{}
	for _, list := range [][]pending{defines, modifies} {
		for _, item := range list {
			contributor := p.contributors[item.pkg.ID()]
			recordType := p.recordTypes[item.target]
			var contribution string
			if err := p.tx.QueryRow(p.ctx, `INSERT INTO game_data.schema_contributions(game_id,record_type_id,contributor_id,name) VALUES($1,$2,$3,$4) ON CONFLICT(game_id,contributor_id,record_type_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING contribution_id::text`, p.gameID, recordType, contributor, item.declaration.Source).Scan(&contribution); err != nil {
				return fmt.Errorf("register contribution %s of %s: %w", item.declaration.Source, item.pkg.ID(), err)
			}
			payload, err := jsonToBSON(item.declaration.Raw)
			if err != nil {
				return fmt.Errorf("encode contribution %s of %s: %w", item.declaration.Source, item.pkg.ID(), err)
			}
			action, target := "define", (*string)(nil)
			if item.declaration.Modify != "" {
				definition := p.definitions[item.target]
				action, target = "modify", &definition
			} else {
				p.definitions[item.target] = contribution
			}
			if _, err := p.tx.Exec(p.ctx, `INSERT INTO game_data.revision_contributions(game_id,revision_id,contribution_id,record_type_id,contributor_id,contribution_order,action,target_contribution_id,payload_bson) VALUES($1,$2,$3,$4,$5,$6,$7,$8::uuid,$9)`, p.gameID, p.revisionID, contribution, recordType, contributor, order[contributor], action, target, payload); err != nil {
				return fmt.Errorf("add contribution %s of %s to revision: %w", item.declaration.Source, item.pkg.ID(), err)
			}
			order[contributor]++
		}
	}
	return nil
}

func jsonToBSON(document []byte) ([]byte, error) {
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	if value == nil {
		return nil, errors.New("document must be an object")
	}
	converted, err := restoreBSON(value, nil)
	if err != nil {
		return nil, err
	}
	return bson.Marshal(converted)
}
