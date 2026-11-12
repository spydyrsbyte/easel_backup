package games

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"easel/internal/automation"
	"easel/internal/automation/pgstore"
	"easel/internal/schema"
)

type RecordRule struct {
	Type    string            `json:"type"`
	Delete  bool              `json:"delete,omitempty"`
	Retype  string            `json:"retype,omitempty"`
	Rename  map[string]string `json:"rename,omitempty"`
	Set     map[string]any    `json:"set,omitempty"`
	Default map[string]any    `json:"default,omitempty"`
	Unset   []string          `json:"unset,omitempty"`
}

type MigrationPlan struct {
	FromRevision string `json:"fromRevision,omitempty"`
	Remove       struct {
		Contributors []string `json:"contributors,omitempty"`
		Declarations []string `json:"declarations,omitempty"`
	} `json:"remove,omitempty"`
	DropUndeclaredFields bool         `json:"dropUndeclaredFields,omitempty"`
	Records              []RecordRule `json:"records,omitempty"`
	DryRun               bool         `json:"-"`
}

type MigrationReport struct {
	FromRevision string   `json:"fromRevision"`
	Revision     string   `json:"revision,omitempty"`
	Converted    int      `json:"converted"`
	Deleted      int      `json:"deleted"`
	Unchanged    int      `json:"unchanged"`
	Removed      []string `json:"removed"`
	DryRun       bool     `json:"dryRun"`
}

type SchemaContributor struct {
	Name         string   `json:"name"`
	Kind         string   `json:"kind"`
	Version      string   `json:"version"`
	Installed    bool     `json:"installed"`
	Selected     bool     `json:"selected"`
	Declarations []string `json:"declarations"`
	Fragments    int      `json:"fragments"`
}

type SchemaStatus struct {
	Game         Game                `json:"game"`
	Revision     string              `json:"revision"`
	Contributors []SchemaContributor `json:"contributors"`
	Types        map[string]int      `json:"types"`
	Pending      string              `json:"pending,omitempty"`
}

func ParseMigrationPlan(data []byte) (MigrationPlan, error) {
	var plan MigrationPlan
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	if err := decoder.Decode(&plan); err != nil {
		return MigrationPlan{}, fmt.Errorf("invalid migration plan: %w", err)
	}
	for index, rule := range plan.Records {
		if rule.Type == "" {
			return MigrationPlan{}, fmt.Errorf("migration plan record rule %d needs a type", index+1)
		}
		if rule.Delete && (rule.Retype != "" || len(rule.Rename)+len(rule.Set)+len(rule.Default)+len(rule.Unset) > 0) {
			return MigrationPlan{}, fmt.Errorf("migration plan record rule %d deletes %s and cannot also change it", index+1, rule.Type)
		}
	}
	return plan, nil
}

func ruleKey(rule schema.Contribution) string {
	return rule.Package.ID() + "/" + rule.Declaration.Source
}

func (m *Manager) SchemaStatus(ctx context.Context, id string) (SchemaStatus, error) {
	game, err := m.Get(ctx, id)
	if err != nil {
		return SchemaStatus{}, err
	}
	revision, saved, composed, err := (&pgstore.Revisions{Pool: m.Pool}).LoadSchema(ctx, id)
	if err != nil {
		return SchemaStatus{}, err
	}
	status := SchemaStatus{Game: game, Revision: revision, Types: map[string]int{}}
	for _, name := range composed.Names() {
		status.Types[name] = 0
	}
	rows, err := m.Pool.Query(ctx, `SELECT t.name,count(*) FROM game_data.records r JOIN game_data.record_types t USING(game_id,record_type_id) WHERE r.game_id=$1 GROUP BY t.name`, id)
	if err != nil {
		return SchemaStatus{}, err
	}
	for rows.Next() {
		var name string
		var count int
		if err := rows.Scan(&name, &count); err != nil {
			rows.Close()
			return SchemaStatus{}, err
		}
		status.Types[name] = count
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return SchemaStatus{}, err
	}
	selected := map[string]bool{game.Application: true}
	if packages, plan, err := m.resolveSaved(ctx, game); err == nil {
		for _, pkg := range packages {
			selected[pkg.ID()] = true
		}
		if err := (&pgstore.Revisions{Pool: m.Pool}).Preview(ctx, id, plan); err != nil {
			status.Pending = err.Error()
		}
	} else {
		status.Pending = err.Error()
	}
	declarations := map[string][]string{}
	for _, rule := range saved {
		declarations[rule.Package.ID()] = append(declarations[rule.Package.ID()], rule.Declaration.Source)
	}
	rows, err = m.Pool.Query(ctx, `SELECT c.name,c.kind,r.package_version,(SELECT count(*) FROM game_data.record_fragments f WHERE f.game_id=c.game_id AND f.contributor_id=c.contributor_id)
 FROM game_data.revision_contributors r JOIN game_data.contributors c USING(game_id,contributor_id) WHERE r.game_id=$1 AND r.revision_id=$2 ORDER BY r.load_position`, id, revision)
	if err != nil {
		return SchemaStatus{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var contributor SchemaContributor
		if err := rows.Scan(&contributor.Name, &contributor.Kind, &contributor.Version, &contributor.Fragments); err != nil {
			return SchemaStatus{}, err
		}
		_, application := m.Catalog.Applications[contributor.Name]
		_, module := m.Catalog.Modules[contributor.Name]
		contributor.Installed = application || module
		for _, global := range m.Globals {
			if global.ID() == contributor.Name {
				contributor.Installed, contributor.Selected = true, true
			}
		}
		contributor.Selected = contributor.Selected || selected[contributor.Name]
		contributor.Declarations = declarations[contributor.Name]
		if contributor.Declarations == nil {
			contributor.Declarations = []string{}
		}
		status.Contributors = append(status.Contributors, contributor)
	}
	return status, rows.Err()
}

func splitPath(path string) []string { return strings.Split(path, ".") }

func readPath(data map[string]any, path string) (any, bool) {
	parts := splitPath(path)
	var current any = data
	for _, part := range parts {
		object, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = object[part]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

func writePath(data map[string]any, path string, value any) error {
	parts := splitPath(path)
	current := data
	for _, part := range parts[:len(parts)-1] {
		next, ok := current[part].(map[string]any)
		if !ok {
			if _, exists := current[part]; exists {
				return fmt.Errorf("field %s is not a branch", path)
			}
			next = map[string]any{}
			current[part] = next
		}
		current = next
	}
	current[parts[len(parts)-1]] = value
	return nil
}

func removePath(data map[string]any, path string) {
	parts := splitPath(path)
	current := data
	for _, part := range parts[:len(parts)-1] {
		next, ok := current[part].(map[string]any)
		if !ok {
			return
		}
		current = next
	}
	delete(current, parts[len(parts)-1])
}

func sortedPaths(values map[string]string) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func (m *Manager) ApplyMigration(ctx context.Context, id string, plan MigrationPlan) (MigrationReport, error) {
	game, err := m.Get(ctx, id)
	if err != nil {
		return MigrationReport{}, err
	}
	revisions := &pgstore.Revisions{Pool: m.Pool}
	revision, saved, before, err := revisions.LoadSchema(ctx, id)
	if err != nil {
		return MigrationReport{}, err
	}
	if plan.FromRevision != "" && plan.FromRevision != revision {
		return MigrationReport{}, fmt.Errorf("migration plan was written for revision %s, but game %s is at revision %s", plan.FromRevision, game.Name, revision)
	}
	packages, _, err := m.resolveSaved(ctx, game)
	if err != nil {
		return MigrationReport{}, err
	}
	incoming, err := schema.PackageRules(packages)
	if err != nil {
		return MigrationReport{}, err
	}
	removedContributors, removedDeclarations := map[string]bool{}, map[string]bool{}
	for _, name := range plan.Remove.Contributors {
		removedContributors[name] = true
	}
	for _, name := range plan.Remove.Declarations {
		removedDeclarations[name] = true
	}
	known := map[string]bool{}
	rules := append([]schema.Contribution(nil), saved...)
	positions := map[string]int{}
	for index, rule := range rules {
		positions[ruleKey(rule)] = index
		known[rule.Package.ID()] = true
		known[ruleKey(rule)] = true
	}
	for _, rule := range incoming {
		known[rule.Package.ID()] = true
		known[ruleKey(rule)] = true
		if index, found := positions[ruleKey(rule)]; found {
			rules[index] = rule
		} else {
			positions[ruleKey(rule)] = len(rules)
			rules = append(rules, rule)
		}
	}
	report := MigrationReport{FromRevision: revision, Removed: []string{}, DryRun: plan.DryRun}
	for _, name := range append(append([]string(nil), plan.Remove.Contributors...), plan.Remove.Declarations...) {
		if !known[name] {
			return MigrationReport{}, fmt.Errorf("migration plan removes %s, which game %s does not have", name, game.Name)
		}
	}
	kept := rules[:0:0]
	for _, rule := range rules {
		if removedContributors[rule.Package.ID()] || removedDeclarations[ruleKey(rule)] {
			report.Removed = append(report.Removed, ruleKey(rule))
			continue
		}
		kept = append(kept, rule)
	}
	after, err := schema.ComposeRules(kept)
	if err != nil {
		return MigrationReport{}, fmt.Errorf("the migrated schema does not compose: %w", err)
	}
	for index, rule := range plan.Records {
		if _, err := before.Type(rule.Type); err != nil {
			return MigrationReport{}, fmt.Errorf("migration plan record rule %d: %s is not a saved record type", index+1, rule.Type)
		}
		if rule.Retype != "" {
			if _, err := after.Type(rule.Retype); err != nil {
				return MigrationReport{}, fmt.Errorf("migration plan record rule %d: %s is not a type of the migrated schema", index+1, rule.Retype)
			}
		}
	}
	transform := func(_ context.Context, record automation.Record) (*automation.Record, error) {
		changed := false
		for _, rule := range plan.Records {
			if !before.IsA(record.Type, rule.Type) && record.Type != rule.Type {
				continue
			}
			if rule.Delete {
				report.Deleted++
				return nil, nil
			}
			for _, from := range sortedPaths(rule.Rename) {
				if value, found := readPath(record.Data, from); found {
					removePath(record.Data, from)
					if err := writePath(record.Data, rule.Rename[from], value); err != nil {
						return nil, err
					}
					changed = true
				}
			}
			for _, path := range rule.Unset {
				if _, found := readPath(record.Data, path); found {
					removePath(record.Data, path)
					changed = true
				}
			}
			for path, value := range rule.Default {
				if _, found := readPath(record.Data, path); !found {
					if err := writePath(record.Data, path, value); err != nil {
						return nil, err
					}
					changed = true
				}
			}
			for path, value := range rule.Set {
				if err := writePath(record.Data, path, value); err != nil {
					return nil, err
				}
				changed = true
			}
			if rule.Retype != "" && rule.Retype != record.Type {
				record.Type = rule.Retype
				changed = true
			}
		}
		target, err := after.Type(record.Type)
		if err != nil {
			return nil, fmt.Errorf("its type %s is removed; add a record rule that deletes or retypes it", record.Type)
		}
		if plan.DropUndeclaredFields {
			for field := range record.Data {
				if target.Fields[field] == nil {
					delete(record.Data, field)
					changed = true
				}
			}
		}
		if changed {
			report.Converted++
		} else {
			report.Unchanged++
		}
		return &record, nil
	}
	migration := pgstore.SchemaMigration{FromRevision: revision, Rules: kept, Transform: transform, DryRun: plan.DryRun}
	published, err := m.migrate(ctx, game, migration)
	if err != nil {
		return MigrationReport{}, err
	}
	report.Revision = published
	if !plan.DryRun {
		if _, err := m.Pool.Exec(ctx, `DELETE FROM game_data.record_fragments f WHERE f.game_id=$1 AND NOT EXISTS (
 SELECT 1 FROM game_data.revision_contributions c WHERE c.game_id=f.game_id AND c.revision_id=$2 AND c.contributor_id=f.contributor_id)`, id, published); err != nil {
			return report, fmt.Errorf("the migration succeeded, but clearing emptied fragments failed: %w", err)
		}
	}
	return report, nil
}
