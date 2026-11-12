package portable

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"easel/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ExportOptions struct {
	GamesDir string
	ServerID string
}

func Export(ctx context.Context, pool *pgxpool.Pool, gameID, target string, options ExportOptions) (Header, error) {
	return create(target, GameFormat, func(w *writer) error {
		tx, err := snapshot(ctx, pool)
		if err != nil {
			return err
		}
		defer tx.Rollback(context.Background())
		var revision *string
		err = tx.QueryRow(ctx, `SELECT g.name,c.name,g.modules,g.active_revision_id::text FROM game_data.games g
 JOIN game_data.contributors c ON c.game_id=g.game_id AND c.contributor_id=g.application_id
 WHERE g.game_id::text=$1 AND g.kind='game' AND g.server_id=$2`, gameID, database.ServerID(options.ServerID)).Scan(&w.header.Name, &w.header.Application, &w.header.Modules, &revision)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("game %s does not exist on this server", gameID)
		}
		if err != nil {
			return err
		}
		w.header.Game = gameID
		for _, entry := range gameTables {
			if err := w.rows(ctx, tx, entry, "t.game_id::text=$1", gameID); err != nil {
				return err
			}
		}
		if revision != nil {
			rows, err := tx.Query(ctx, `SELECT c.name,c.kind,r.package_version,encode(r.package_sha256,'hex') FROM game_data.revision_contributors r
 JOIN game_data.contributors c USING(game_id,contributor_id) WHERE r.game_id::text=$1 AND r.revision_id::text=$2 ORDER BY r.load_position`, gameID, *revision)
			if err != nil {
				return err
			}
			for rows.Next() {
				var requirement Requirement
				if err := rows.Scan(&requirement.ID, &requirement.Kind, &requirement.Version, &requirement.Hash); err != nil {
					rows.Close()
					return err
				}
				w.header.Requires = append(w.header.Requires, requirement)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return err
			}
		}
		rows, err := tx.Query(ctx, `SELECT u.user_id::text,u.display_name,coalesce(p.username,'') FROM accounts.users u LEFT JOIN accounts.passwords p USING(user_id)
 WHERE u.user_id IN (SELECT user_id FROM game_data.members WHERE game_id::text=$1
  UNION SELECT id FROM game_data.security_principals WHERE game_id::text=$1
  UNION SELECT owner_id FROM game_data.files WHERE game_id::text=$1 AND owner_id IS NOT NULL) ORDER BY u.created_at,u.user_id`, gameID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var account Account
			if err := rows.Scan(&account.ID, &account.DisplayName, &account.Username); err != nil {
				rows.Close()
				return err
			}
			w.header.Accounts = append(w.header.Accounts, account)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		return w.tree(filepath.Join(options.GamesDir, gameID, "files"), "files/"+gameID+"/", skipIncoming)
	})
}

type ImportOptions struct {
	GamesDir       string
	ServerID       string
	Name           string
	Accounts       map[string]string
	MatchUsernames bool
	Installed      func(id string) bool
}

type ImportedAccount struct {
	From        string `json:"from"`
	To          string `json:"to"`
	DisplayName string `json:"displayName"`
	Placeholder bool   `json:"placeholder"`
}

type ImportReport struct {
	Game     string            `json:"game"`
	Name     string            `json:"name"`
	Accounts []ImportedAccount `json:"accounts"`
	Files    int               `json:"files"`
	Warnings []string          `json:"warnings"`
}

func replaceAll(text string, replacements map[string]string, order []string) string {
	for _, from := range order {
		to := replacements[from]
		text = strings.ReplaceAll(text, from, to)
		text = strings.ReplaceAll(text, hexText(from), hexText(to))
	}
	return text
}

func Import(ctx context.Context, pool *pgxpool.Pool, source string, options ImportOptions) (ImportReport, error) {
	r, err := open(source, GameFormat)
	if err != nil {
		return ImportReport{}, err
	}
	defer r.zip.Close()
	server := database.ServerID(options.ServerID)
	report := ImportReport{Name: r.header.Name, Accounts: []ImportedAccount{}, Warnings: []string{}}
	if options.Name != "" {
		report.Name = options.Name
	}
	if options.Installed != nil {
		missing := []string{}
		if !options.Installed(r.header.Application) {
			missing = append(missing, r.header.Application)
		}
		for _, module := range r.header.Modules {
			if !options.Installed(module) {
				report.Warnings = append(report.Warnings, "module "+module+" is not installed; its saved data is kept and its code will not run")
			}
		}
		if len(missing) > 0 {
			return ImportReport{}, fmt.Errorf("install %s before importing this game", strings.Join(missing, ", "))
		}
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return ImportReport{}, err
	}
	defer tx.Rollback(context.Background())
	if err := tx.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&report.Game); err != nil {
		return ImportReport{}, err
	}
	replacements := map[string]string{r.header.Game: report.Game}
	exported := map[string]bool{}
	for _, account := range r.header.Accounts {
		exported[account.ID] = true
	}
	for from := range options.Accounts {
		if !exported[from] {
			return ImportReport{}, fmt.Errorf("account mapping names %s, which is not an account of the exported game", from)
		}
	}
	find := func(reference string) (string, error) {
		var id string
		err := tx.QueryRow(ctx, `SELECT u.user_id::text FROM accounts.users u LEFT JOIN accounts.passwords p USING(user_id) WHERE u.server_id=$1 AND (u.user_id::text=$2 OR lower(p.username)=lower($2))`, server, reference).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return id, err
	}
	taken := map[string]string{}
	for _, account := range r.header.Accounts {
		imported := ImportedAccount{From: account.ID, DisplayName: account.DisplayName}
		if reference, mapped := options.Accounts[account.ID]; mapped {
			if imported.To, err = find(reference); err != nil {
				return ImportReport{}, err
			}
			if imported.To == "" {
				return ImportReport{}, fmt.Errorf("account mapping for %s names %s, which is not an account on this server", account.DisplayName, reference)
			}
		} else if options.MatchUsernames && account.Username != "" {
			if imported.To, err = find(account.Username); err != nil {
				return ImportReport{}, err
			}
		}
		if imported.To == "" {
			imported.Placeholder = true
			var exists bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM accounts.users WHERE user_id::text=$1)`, account.ID).Scan(&exists); err != nil {
				return ImportReport{}, err
			}
			if exists {
				err = tx.QueryRow(ctx, `INSERT INTO accounts.users(display_name,server_id) VALUES($1,$2) RETURNING user_id::text`, account.DisplayName+" (imported)", server).Scan(&imported.To)
			} else {
				err = tx.QueryRow(ctx, `INSERT INTO accounts.users(user_id,display_name,server_id) VALUES($1,$2,$3) RETURNING user_id::text`, account.ID, account.DisplayName+" (imported)", server).Scan(&imported.To)
			}
			if err != nil {
				return ImportReport{}, fmt.Errorf("create placeholder account for %s: %w", account.DisplayName, err)
			}
		}
		if other, used := taken[imported.To]; used {
			return ImportReport{}, fmt.Errorf("accounts %s and %s both map to %s", other, account.ID, imported.To)
		}
		taken[imported.To] = account.ID
		replacements[account.ID] = imported.To
		report.Accounts = append(report.Accounts, imported)
	}
	order := make([]string, 0, len(replacements))
	for from := range replacements {
		order = append(order, from)
	}
	sort.Strings(order)
	intermediate := map[string]string{}
	final := map[string]string{}
	for index, from := range order {
		placeholder := fmt.Sprintf("00000000-0000-4000-8000-%012d", index)
		intermediate[from] = placeholder
		final[placeholder] = replacements[from]
	}
	finalOrder := make([]string, 0, len(final))
	for from := range final {
		finalOrder = append(finalOrder, from)
	}
	sort.Strings(finalOrder)
	rewrite := func(name string, row map[string]any) error {
		encoded, err := json.Marshal(row)
		if err != nil {
			return err
		}
		text := replaceAll(replaceAll(string(encoded), intermediate, order), final, finalOrder)
		for key := range row {
			delete(row, key)
		}
		decoder := json.NewDecoder(strings.NewReader(text))
		decoder.UseNumber()
		if err := decoder.Decode(&row); err != nil {
			return err
		}
		if name == "game_data.games" {
			row["server_id"], row["name"], row["lifecycle"], row["suspended_at"] = server, report.Name, "stopped", nil
		}
		return nil
	}
	if err := r.load(ctx, tx, gameTables, rewrite); err != nil {
		return ImportReport{}, err
	}
	if report.Files, _, err = r.extract("files/"+r.header.Game+"/", filepath.Join(options.GamesDir, report.Game, "files"), true, nil); err != nil {
		return ImportReport{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ImportReport{}, fmt.Errorf("commit import: %w", err)
	}
	return report, nil
}

func Reassign(ctx context.Context, pool *pgxpool.Pool, serverID, gameID, from, to string) error {
	server := database.ServerID(serverID)
	tx, err := database.BeginSerializable(ctx, pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var game, source, target bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_data.games WHERE game_id::text=$1 AND server_id=$2 AND kind='game'),
 EXISTS(SELECT 1 FROM game_data.security_principals WHERE game_id::text=$1 AND id::text=$3),
 EXISTS(SELECT 1 FROM accounts.users WHERE user_id::text=$4 AND server_id=$2)`, gameID, server, from, to).Scan(&game, &source, &target); err != nil {
		return err
	}
	switch {
	case !game:
		return fmt.Errorf("game %s does not exist on this server", gameID)
	case !source:
		return fmt.Errorf("account %s has no place in game %s", from, gameID)
	case !target:
		return fmt.Errorf("account %s does not exist on this server", to)
	}
	var already bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_data.security_principals WHERE game_id::text=$1 AND id::text=$2)`, gameID, to).Scan(&already); err != nil {
		return err
	}
	if already {
		return fmt.Errorf("account %s is already in game %s; remove it from the game before it takes over another account's place", to, gameID)
	}
	for _, statement := range []string{
		`INSERT INTO game_data.security_principals(game_id,id,principal_type,attributes) SELECT game_id,$3::uuid,principal_type,attributes FROM game_data.security_principals WHERE game_id::text=$1 AND id::text=$2`,
		`UPDATE game_data.security_relationships SET subject_id=$3::uuid WHERE game_id::text=$1 AND subject_id::text=$2`,
		`UPDATE game_data.security_relationships SET object_id=$3::uuid WHERE game_id::text=$1 AND object_id::text=$2`,
		`UPDATE game_data.security_assignments SET principal_id=$3::uuid WHERE game_id::text=$1 AND principal_id::text=$2`,
		`UPDATE game_data.security_assignments SET resource_id=$3::uuid WHERE game_id::text=$1 AND resource_id::text=$2`,
		`DELETE FROM game_data.security_principals WHERE game_id::text=$1 AND id::text=$2`,
		`UPDATE game_data.members SET user_id=$3::uuid WHERE game_id::text=$1 AND user_id::text=$2`,
		`UPDATE game_data.files SET owner_id=$3::uuid WHERE game_id::text=$1 AND owner_id::text=$2`,
		`UPDATE game_data.automations SET creator_id=$3,definition=replace(definition::text,$2,$3)::jsonb WHERE game_id::text=$1 AND (creator_id=$2 OR definition::text LIKE '%'||$2||'%')`,
		`UPDATE game_data.scheduled_events SET payload=replace(payload::text,$2,$3)::jsonb WHERE game_id::text=$1 AND payload::text LIKE '%'||$2||'%'`,
		`UPDATE game_data.record_fragments SET payload_bson=decode(replace(encode(payload_bson,'hex'),encode(convert_to($2,'UTF8'),'hex'),encode(convert_to($3,'UTF8'),'hex')),'hex') WHERE game_id::text=$1 AND position(convert_to($2,'UTF8') in payload_bson)>0`,
	} {
		arguments := []any{gameID, from, to}
		if !strings.Contains(statement, "$3") {
			arguments = arguments[:2]
		}
		if _, err := tx.Exec(ctx, statement, arguments...); err != nil {
			return fmt.Errorf("reassign account: %w", err)
		}
	}
	var leftover bool
	if err := tx.QueryRow(ctx, `SELECT NOT EXISTS(SELECT 1 FROM accounts.passwords WHERE user_id::text=$1) AND NOT EXISTS(SELECT 1 FROM accounts.identities WHERE user_id::text=$1)
 AND NOT EXISTS(SELECT 1 FROM game_data.members WHERE user_id::text=$1)`, from).Scan(&leftover); err != nil {
		return err
	}
	if leftover {
		if _, err := tx.Exec(ctx, `DELETE FROM accounts.users WHERE user_id::text=$1 AND server_id=$2`, from, server); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reassignment: %w", err)
	}
	return nil
}
