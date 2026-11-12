package portable

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"easel/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	BackupFormat = "easel.backup/1"
	GameFormat   = "easel.game/1"
	headerName   = "easel-archive.json"
	maxRowBytes  = 64 << 20
)

type table struct {
	name  string
	order string
}

var installationTables = []table{
	{"hosting.servers", "created_at,server_id"},
	{"accounts.users", "created_at,user_id"},
	{"accounts.passwords", "user_id"},
	{"accounts.identities", "provider,subject"},
	{"accounts.sessions", "token_hash"},
	{"accounts.administrators", "user_id"},
}

var gameTables = []table{
	{"game_data.games", "created_at,game_id"},
	{"game_data.contributors", "game_id,contributor_id"},
	{"game_data.record_types", "game_id,record_type_id"},
	{"game_data.contract_revisions", "created_at,revision_id"},
	{"game_data.revision_contributors", "game_id,revision_id,load_position"},
	{"game_data.schema_contributions", "game_id,contribution_id"},
	{"game_data.revision_contributions", "game_id,revision_id,action,contribution_order"},
	{"game_data.effective_schemas", "game_id,revision_id,record_type_id"},
	{"game_data.records", "game_id,record_id"},
	{"game_data.record_fragments", "game_id,record_id,contributor_id"},
	{"game_data.automations", "game_id,name"},
	{"game_data.security_principals", "game_id,id"},
	{"game_data.security_relationships", "game_id,id"},
	{"game_data.security_registries", "game_id"},
	{"game_data.security_assignments", "game_id,id"},
	{"game_data.members", "game_id,user_id"},
	{"game_data.files", "game_id,file_id"},
	{"game_data.scheduled_events", "game_id,schedule_id"},
}

type Account struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Username    string `json:"username,omitempty"`
}

type Requirement struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Version string `json:"version"`
	Hash    string `json:"hash"`
}

type Header struct {
	Format        string         `json:"format"`
	SchemaVersion int            `json:"schemaVersion"`
	Created       time.Time      `json:"created"`
	Rows          map[string]int `json:"rows"`
	Files         int            `json:"files"`
	Game          string         `json:"game,omitempty"`
	Name          string         `json:"name,omitempty"`
	Application   string         `json:"application,omitempty"`
	Modules       []string       `json:"modules,omitempty"`
	Requires      []Requirement  `json:"requires,omitempty"`
	Accounts      []Account      `json:"accounts,omitempty"`
	Packages      bool           `json:"packages,omitempty"`
}

type writer struct {
	zip    *zip.Writer
	header Header
}

func (w *writer) rows(ctx context.Context, tx pgx.Tx, entry table, filter string, arguments ...any) error {
	query := `SELECT row_to_json(t)::text FROM ` + entry.name + ` t`
	if filter != "" {
		query += ` WHERE ` + filter
	}
	rows, err := tx.Query(ctx, query+` ORDER BY `+entry.order, arguments...)
	if err != nil {
		return fmt.Errorf("read %s: %w", entry.name, err)
	}
	defer rows.Close()
	target, err := w.zip.Create("database/" + entry.name + ".jsonl")
	if err != nil {
		return err
	}
	count := 0
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return fmt.Errorf("read %s: %w", entry.name, err)
		}
		if _, err := io.WriteString(target, line+"\n"); err != nil {
			return err
		}
		count++
	}
	w.header.Rows[entry.name] = count
	return rows.Err()
}

func (w *writer) tree(source, prefix string, skip func(string) bool) error {
	err := filepath.WalkDir(source, func(current string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(source, current)
		if err != nil {
			return err
		}
		name := filepath.ToSlash(relative)
		if skip != nil && name != "." && skip(name) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() || !entry.Type().IsRegular() {
			return nil
		}
		contents, err := os.Open(current)
		if err != nil {
			return err
		}
		defer contents.Close()
		target, err := w.zip.Create(prefix + name)
		if err != nil {
			return err
		}
		_, err = io.Copy(target, contents)
		w.header.Files++
		return err
	})
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}

func skipIncoming(name string) bool { return name == "incoming" }

func (w *writer) finish() error {
	target, err := w.zip.Create(headerName)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(target)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(w.header); err != nil {
		return err
	}
	return w.zip.Close()
}

func create(target string, format string, write func(*writer) error) (Header, error) {
	temporary := target + ".partial"
	file, err := os.Create(temporary)
	if err != nil {
		return Header{}, err
	}
	w := &writer{zip: zip.NewWriter(file), header: Header{Format: format, SchemaVersion: database.SchemaVersion, Created: time.Now().UTC(), Rows: map[string]int{}}}
	err = write(w)
	if err == nil {
		err = w.finish()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(temporary)
		return Header{}, err
	}
	if err := os.Rename(temporary, target); err != nil {
		os.Remove(temporary)
		return Header{}, err
	}
	return w.header, nil
}

func snapshot(ctx context.Context, pool *pgxpool.Pool) (pgx.Tx, error) {
	return pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
}

type BackupOptions struct {
	GamesDir  string
	ConfigDir string
	EaselDir  string
	Packages  bool
}

func Backup(ctx context.Context, pool *pgxpool.Pool, target string, options BackupOptions) (Header, error) {
	return create(target, BackupFormat, func(w *writer) error {
		tx, err := snapshot(ctx, pool)
		if err != nil {
			return err
		}
		defer tx.Rollback(context.Background())
		for _, entry := range append(append([]table(nil), installationTables...), gameTables...) {
			if err := w.rows(ctx, tx, entry, ""); err != nil {
				return err
			}
		}
		rows, err := tx.Query(ctx, `SELECT game_id::text FROM game_data.games ORDER BY game_id`)
		if err != nil {
			return err
		}
		ids := []string{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			ids = append(ids, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, id := range ids {
			if err := w.tree(filepath.Join(options.GamesDir, id, "files"), "files/"+id+"/", skipIncoming); err != nil {
				return fmt.Errorf("back up files of game %s: %w", id, err)
			}
		}
		if options.ConfigDir != "" {
			if err := w.tree(options.ConfigDir, "config/", nil); err != nil {
				return fmt.Errorf("back up configuration: %w", err)
			}
		}
		if options.Packages && options.EaselDir != "" {
			w.header.Packages = true
			for _, folder := range []string{"applications", "modules", "server"} {
				if err := w.tree(filepath.Join(options.EaselDir, folder), "packages/"+folder+"/", nil); err != nil {
					return fmt.Errorf("back up packages: %w", err)
				}
			}
		}
		return nil
	})
}

type reader struct {
	zip    *zip.ReadCloser
	header Header
	files  map[string]*zip.File
}

func open(source string, format string) (*reader, error) {
	archive, err := zip.OpenReader(source)
	if err != nil {
		return nil, fmt.Errorf("open archive %s: %w", source, err)
	}
	r := &reader{zip: archive, files: map[string]*zip.File{}}
	for _, file := range archive.File {
		r.files[file.Name] = file
	}
	header := r.files[headerName]
	if header == nil {
		archive.Close()
		return nil, fmt.Errorf("%s is not an Easel archive", source)
	}
	contents, err := header.Open()
	if err == nil {
		err = json.NewDecoder(contents).Decode(&r.header)
		contents.Close()
	}
	if err != nil {
		archive.Close()
		return nil, fmt.Errorf("read archive header: %w", err)
	}
	if r.header.Format != format {
		archive.Close()
		return nil, fmt.Errorf("%s is a %s archive, not %s", source, r.header.Format, format)
	}
	if r.header.SchemaVersion != database.SchemaVersion {
		archive.Close()
		return nil, fmt.Errorf("archive uses database schema version %d and this Easel uses version %d", r.header.SchemaVersion, database.SchemaVersion)
	}
	return r, nil
}

func Inspect(source string) (Header, error) {
	archive, err := zip.OpenReader(source)
	if err != nil {
		return Header{}, fmt.Errorf("open archive %s: %w", source, err)
	}
	defer archive.Close()
	for _, file := range archive.File {
		if file.Name != headerName {
			continue
		}
		contents, err := file.Open()
		if err != nil {
			return Header{}, err
		}
		defer contents.Close()
		var header Header
		return header, json.NewDecoder(contents).Decode(&header)
	}
	return Header{}, fmt.Errorf("%s is not an Easel archive", source)
}

func (r *reader) lines(name string, each func(map[string]any) error) error {
	file := r.files["database/"+name+".jsonl"]
	if file == nil {
		return nil
	}
	contents, err := file.Open()
	if err != nil {
		return err
	}
	defer contents.Close()
	scanner := bufio.NewScanner(contents)
	scanner.Buffer(make([]byte, 1<<20), maxRowBytes)
	for scanner.Scan() {
		decoder := json.NewDecoder(bytes.NewReader(scanner.Bytes()))
		decoder.UseNumber()
		row := map[string]any{}
		if err := decoder.Decode(&row); err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if err := each(row); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func insert(ctx context.Context, tx pgx.Tx, name string, row map[string]any, conflict string) error {
	encoded, err := json.Marshal(row)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO `+name+` SELECT * FROM jsonb_populate_record(null::`+name+`, $1::jsonb) `+conflict, string(encoded)); err != nil {
		return fmt.Errorf("restore %s: %w", name, err)
	}
	return nil
}

type deferred struct {
	sealed map[[2]string]any
	active map[string]any
}

func (r *reader) load(ctx context.Context, tx pgx.Tx, tables []table, rewrite func(string, map[string]any) error) error {
	state := deferred{sealed: map[[2]string]any{}, active: map[string]any{}}
	for _, entry := range tables {
		conflict := ""
		if entry.name == "hosting.servers" {
			conflict = "ON CONFLICT DO NOTHING"
		}
		err := r.lines(entry.name, func(row map[string]any) error {
			if rewrite != nil {
				if err := rewrite(entry.name, row); err != nil {
					return err
				}
			}
			switch entry.name {
			case "game_data.games":
				state.active[fmt.Sprint(row["game_id"])] = row["active_revision_id"]
				row["active_revision_id"] = nil
			case "game_data.contract_revisions":
				state.sealed[[2]string{fmt.Sprint(row["game_id"]), fmt.Sprint(row["revision_id"])}] = row["sealed_at"]
				row["sealed_at"] = nil
			}
			return insert(ctx, tx, entry.name, row, conflict)
		})
		if err != nil {
			return err
		}
	}
	for key, sealed := range state.sealed {
		if sealed == nil {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE game_data.contract_revisions SET sealed_at=$3::timestamptz WHERE game_id=$1 AND revision_id=$2`, key[0], key[1], fmt.Sprint(sealed)); err != nil {
			return fmt.Errorf("seal restored revision %s: %w", key[1], err)
		}
	}
	for game, revision := range state.active {
		if revision == nil {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE game_data.games SET active_revision_id=$2 WHERE game_id=$1`, game, fmt.Sprint(revision)); err != nil {
			return fmt.Errorf("activate restored revision of game %s: %w", game, err)
		}
	}
	return nil
}

func safeJoin(root, name string) (string, error) {
	cleaned := path.Clean("/" + name)[1:]
	if cleaned == "" || cleaned != name || strings.Contains(name, "\\") || strings.Contains(name, ":") {
		return "", fmt.Errorf("archive entry %q has an unsafe path", name)
	}
	return filepath.Join(root, filepath.FromSlash(cleaned)), nil
}

func (r *reader) extract(prefix, root string, overwrite bool, rename func(string) string) (int, []string, error) {
	names := []string{}
	for name := range r.files {
		if strings.HasPrefix(name, prefix) && !strings.HasSuffix(name, "/") {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	written, skipped := 0, []string{}
	for _, name := range names {
		relative := strings.TrimPrefix(name, prefix)
		if rename != nil {
			relative = rename(relative)
		}
		target, err := safeJoin(root, relative)
		if err != nil {
			return written, skipped, err
		}
		if _, err := os.Stat(target); err == nil && !overwrite {
			skipped = append(skipped, relative)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return written, skipped, err
		}
		source, err := r.files[name].Open()
		if err != nil {
			return written, skipped, err
		}
		file, err := os.Create(target)
		if err == nil {
			_, err = io.Copy(file, source)
			if closeErr := file.Close(); err == nil {
				err = closeErr
			}
		}
		source.Close()
		if err != nil {
			return written, skipped, fmt.Errorf("restore %s: %w", relative, err)
		}
		written++
	}
	return written, skipped, nil
}

type RestoreOptions struct {
	SchemaPath string
	GamesDir   string
	ConfigDir  string
	EaselDir   string
}

type RestoreReport struct {
	Header        Header   `json:"archive"`
	Files         int      `json:"files"`
	Configuration int      `json:"configuration"`
	Packages      int      `json:"packages"`
	KeptExisting  []string `json:"keptExisting"`
}

func Restore(ctx context.Context, pool *pgxpool.Pool, source string, options RestoreOptions) (RestoreReport, error) {
	r, err := open(source, BackupFormat)
	if err != nil {
		return RestoreReport{}, err
	}
	defer r.zip.Close()
	if err := database.Initialize(ctx, pool, options.SchemaPath); err != nil {
		return RestoreReport{}, err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return RestoreReport{}, err
	}
	defer tx.Rollback(context.Background())
	var users, games, servers int
	if err := tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM accounts.users),(SELECT count(*) FROM game_data.games),(SELECT count(*) FROM hosting.servers WHERE server_id<>$1)`, database.DefaultServerID).Scan(&users, &games, &servers); err != nil {
		return RestoreReport{}, err
	}
	if users+games+servers > 0 {
		return RestoreReport{}, fmt.Errorf("restore needs a clean installation, but this database already has %d accounts, %d games, and %d additional servers", users, games, servers)
	}
	if err := r.load(ctx, tx, append(append([]table(nil), installationTables...), gameTables...), nil); err != nil {
		return RestoreReport{}, err
	}
	report := RestoreReport{Header: r.header, KeptExisting: []string{}}
	if report.Files, _, err = r.extract("files/", options.GamesDir, true, func(name string) string {
		id, rest, _ := strings.Cut(name, "/")
		return id + "/files/" + rest
	}); err != nil {
		return RestoreReport{}, err
	}
	var kept []string
	if options.ConfigDir != "" {
		if report.Configuration, kept, err = r.extract("config/", options.ConfigDir, false, nil); err != nil {
			return RestoreReport{}, err
		}
		for _, name := range kept {
			report.KeptExisting = append(report.KeptExisting, "config/"+name)
		}
	}
	if options.EaselDir != "" {
		if report.Packages, kept, err = r.extract("packages/", options.EaselDir, false, nil); err != nil {
			return RestoreReport{}, err
		}
		for _, name := range kept {
			report.KeptExisting = append(report.KeptExisting, "packages/"+name)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return RestoreReport{}, fmt.Errorf("commit restore: %w", err)
	}
	return report, nil
}

func hexText(value string) string { return hex.EncodeToString([]byte(value)) }
