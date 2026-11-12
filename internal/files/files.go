package files

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	DefaultMaxBytes = 32 << 20
	maxNameRunes    = 255
	temporaryFolder = "incoming"
	temporaryAge    = time.Hour
)

var (
	ErrNotFound    = errors.New("file does not exist")
	ErrTooLarge    = errors.New("file is too large")
	ErrUnsupported = errors.New("file type is not allowed")
	ErrMismatch    = errors.New("file contents do not match the declared type")
	ErrInvalidName = errors.New("file name is invalid")
	ErrConflict    = errors.New("file changed since it was read")
)

var DefaultTypes = []string{
	"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/avif",
	"audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/flac", "audio/mp4",
	"video/mp4", "video/webm", "video/ogg",
	"application/pdf", "application/json", "text/plain", "text/markdown", "text/csv",
	"font/woff2", "font/woff", "model/gltf-binary", "application/zip",
}

type File struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	MediaType string    `json:"mediaType"`
	Size      int64     `json:"size"`
	Hash      string    `json:"hash"`
	Owner     string    `json:"owner"`
	Version   int64     `json:"version"`
	Created   time.Time `json:"created"`
	Updated   time.Time `json:"updated"`
}

type Upload struct {
	Name      string
	MediaType string
	Owner     string
}

type Store struct {
	Pool     *pgxpool.Pool
	GameID   string
	Folder   string
	MaxBytes int64
	Types    []string

	mu sync.Mutex
}

func (s *Store) limit() int64 {
	if s.MaxBytes > 0 {
		return s.MaxBytes
	}
	return DefaultMaxBytes
}

func (s *Store) Limit() int64 { return s.limit() }

func (s *Store) allowed(mediaType string) bool {
	types := s.Types
	if types == nil {
		types = DefaultTypes
	}
	for _, allowed := range types {
		if allowed == mediaType {
			return true
		}
	}
	return false
}

func CleanName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) > maxNameRunes {
		return "", ErrInvalidName
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f || r == '/' || r == '\\' {
			return "", ErrInvalidName
		}
	}
	return name, nil
}

func (s *Store) CleanType(declared string) (string, error) {
	mediaType, _, err := mime.ParseMediaType(declared)
	if err != nil || !s.allowed(mediaType) {
		return "", ErrUnsupported
	}
	return mediaType, nil
}

func family(mediaType string) string {
	kind, _, _ := strings.Cut(mediaType, "/")
	return kind
}

func consistent(declared string, head []byte) bool {
	detected, _, _ := mime.ParseMediaType(http.DetectContentType(head))
	if detected == declared {
		return true
	}
	switch declared {
	case "image/svg+xml":
		text := strings.ToLower(string(head))
		return (detected == "text/xml" || detected == "text/plain" || detected == "image/svg+xml") && strings.Contains(text, "<svg")
	case "application/json", "text/markdown", "text/csv", "text/plain":
		return detected == "text/plain"
	case "image/avif", "audio/flac", "audio/mp4", "model/gltf-binary", "font/woff", "font/woff2", "audio/webm", "video/ogg", "audio/ogg":
		return detected == "application/octet-stream" || family(detected) == family(declared) || detected == "application/ogg" || detected == "video/webm" || detected == "video/mp4"
	}
	return false
}

func (s *Store) blob(hash []byte) string {
	name := hex.EncodeToString(hash)
	return filepath.Join(s.Folder, name[:2], name)
}

type staged struct {
	hash []byte
	size int64
	path string
}

func (s *Store) stage(source io.Reader, mediaType string) (staged, error) {
	incoming := filepath.Join(s.Folder, temporaryFolder)
	if err := os.MkdirAll(incoming, 0o755); err != nil {
		return staged{}, fmt.Errorf("prepare file storage: %w", err)
	}
	temporary, err := os.CreateTemp(incoming, "upload-*")
	if err != nil {
		return staged{}, fmt.Errorf("prepare file storage: %w", err)
	}
	keep := false
	defer func() {
		temporary.Close()
		if !keep {
			os.Remove(temporary.Name())
		}
	}()
	digest := sha256.New()
	limited := io.LimitReader(source, s.limit()+1)
	head := make([]byte, 512)
	read, err := io.ReadFull(limited, head)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return staged{}, fmt.Errorf("read file: %w", err)
	}
	head = head[:read]
	if !consistent(mediaType, head) {
		return staged{}, ErrMismatch
	}
	writer := io.MultiWriter(temporary, digest)
	if _, err := writer.Write(head); err != nil {
		return staged{}, fmt.Errorf("store file: %w", err)
	}
	copied, err := io.Copy(writer, limited)
	if err != nil {
		return staged{}, fmt.Errorf("store file: %w", err)
	}
	size := int64(read) + copied
	if size > s.limit() {
		return staged{}, ErrTooLarge
	}
	if err := temporary.Sync(); err != nil {
		return staged{}, fmt.Errorf("store file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return staged{}, fmt.Errorf("store file: %w", err)
	}
	keep = true
	return staged{hash: digest.Sum(nil), size: size, path: temporary.Name()}, nil
}

func (s *Store) adopt(file staged) error {
	target := s.blob(file.hash)
	if _, err := os.Stat(target); err == nil {
		return os.Remove(file.path)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		os.Remove(file.path)
		return fmt.Errorf("store file: %w", err)
	}
	if err := os.Rename(file.path, target); err != nil {
		os.Remove(file.path)
		return fmt.Errorf("store file: %w", err)
	}
	return nil
}

func (s *Store) release(ctx context.Context, hash []byte) {
	var referenced bool
	if err := s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_data.files WHERE game_id=$1 AND sha256=$2)`, s.GameID, hash).Scan(&referenced); err != nil || referenced {
		return
	}
	os.Remove(s.blob(hash))
}

const columns = `file_id::text,name,media_type,size,encode(sha256,'hex'),coalesce(owner_id::text,''),file_version,created_at,updated_at`

func scan(row pgx.Row) (File, error) {
	var file File
	err := row.Scan(&file.ID, &file.Name, &file.MediaType, &file.Size, &file.Hash, &file.Owner, &file.Version, &file.Created, &file.Updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return File{}, ErrNotFound
	}
	if err != nil {
		return File{}, fmt.Errorf("read file: %w", err)
	}
	return file, nil
}

func owner(id string) *string {
	if id == "" {
		return nil
	}
	return &id
}

func (s *Store) prepare(upload Upload) (Upload, error) {
	name, err := CleanName(upload.Name)
	if err != nil {
		return Upload{}, err
	}
	mediaType, err := s.CleanType(upload.MediaType)
	if err != nil {
		return Upload{}, err
	}
	return Upload{Name: name, MediaType: mediaType, Owner: upload.Owner}, nil
}

func (s *Store) Put(ctx context.Context, source io.Reader, upload Upload) (File, error) {
	upload, err := s.prepare(upload)
	if err != nil {
		return File{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.stage(source, upload.MediaType)
	if err != nil {
		return File{}, err
	}
	if err := s.adopt(file); err != nil {
		return File{}, err
	}
	stored, err := scan(s.Pool.QueryRow(ctx, `INSERT INTO game_data.files(game_id,sha256,media_type,size,name,owner_id) VALUES($1,$2,$3,$4,$5,$6::uuid) RETURNING `+columns, s.GameID, file.hash, upload.MediaType, file.size, upload.Name, owner(upload.Owner)))
	if err != nil {
		s.release(context.WithoutCancel(ctx), file.hash)
		return File{}, err
	}
	return stored, nil
}

func (s *Store) Replace(ctx context.Context, id string, version int64, source io.Reader, upload Upload) (File, error) {
	stored, previous, err := s.Exchange(ctx, id, version, source, upload)
	if err != nil {
		return File{}, err
	}
	s.Release(context.WithoutCancel(ctx), previous)
	return stored, nil
}

func (s *Store) Release(ctx context.Context, previous File) {
	hash, err := hex.DecodeString(previous.Hash)
	if err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.release(ctx, hash)
}

func (s *Store) Exchange(ctx context.Context, id string, version int64, source io.Reader, upload Upload) (File, File, error) {
	upload, err := s.prepare(upload)
	if err != nil {
		return File{}, File{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, err := s.Get(ctx, id)
	if err != nil {
		return File{}, File{}, err
	}
	if version != 0 && version != previous.Version {
		return File{}, File{}, ErrConflict
	}
	file, err := s.stage(source, upload.MediaType)
	if err != nil {
		return File{}, File{}, err
	}
	if err := s.adopt(file); err != nil {
		return File{}, File{}, err
	}
	stored, err := scan(s.Pool.QueryRow(ctx, `UPDATE game_data.files SET sha256=$3,media_type=$4,size=$5,name=$6,file_version=file_version+1,updated_at=now() WHERE game_id=$1 AND file_id=$2 AND file_version=$7 RETURNING `+columns, s.GameID, id, file.hash, upload.MediaType, file.size, upload.Name, previous.Version))
	if errors.Is(err, ErrNotFound) {
		err = ErrConflict
	}
	if err != nil {
		s.release(context.WithoutCancel(ctx), file.hash)
		return File{}, File{}, err
	}
	return stored, previous, nil
}

func (s *Store) Restore(ctx context.Context, previous File) error {
	hash, err := hex.DecodeString(previous.Hash)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := os.Stat(s.blob(hash)); err != nil {
		return fmt.Errorf("previous contents of file %s are gone: %w", previous.ID, err)
	}
	current, err := s.Get(ctx, previous.ID)
	if err != nil {
		return err
	}
	if _, err := s.Pool.Exec(ctx, `UPDATE game_data.files SET sha256=$3,media_type=$4,size=$5,name=$6,file_version=file_version+1,updated_at=now() WHERE game_id=$1 AND file_id=$2`, s.GameID, previous.ID, hash, previous.MediaType, previous.Size, previous.Name); err != nil {
		return fmt.Errorf("restore file: %w", err)
	}
	if replaced, err := hex.DecodeString(current.Hash); err == nil {
		s.release(ctx, replaced)
	}
	return nil
}

func valid(id string) bool {
	if len(id) != 36 {
		return false
	}
	for index, r := range id {
		switch {
		case index == 8 || index == 13 || index == 18 || index == 23:
			if r != '-' {
				return false
			}
		case (r < '0' || r > '9') && (r < 'a' || r > 'f') && (r < 'A' || r > 'F'):
			return false
		}
	}
	return true
}

func (s *Store) Get(ctx context.Context, id string) (File, error) {
	if !valid(id) {
		return File{}, ErrNotFound
	}
	return scan(s.Pool.QueryRow(ctx, `SELECT `+columns+` FROM game_data.files WHERE game_id=$1 AND file_id=$2`, s.GameID, id))
}

func (s *Store) List(ctx context.Context) ([]File, error) {
	rows, err := s.Pool.Query(ctx, `SELECT `+columns+` FROM game_data.files WHERE game_id=$1 ORDER BY created_at,file_id`, s.GameID)
	if err != nil {
		return nil, fmt.Errorf("list files: %w", err)
	}
	defer rows.Close()
	found := []File{}
	for rows.Next() {
		file, err := scan(rows)
		if err != nil {
			return nil, err
		}
		found = append(found, file)
	}
	return found, rows.Err()
}

func (s *Store) Open(ctx context.Context, id string) (File, *os.File, error) {
	file, err := s.Get(ctx, id)
	if err != nil {
		return File{}, nil, err
	}
	hash, err := hex.DecodeString(file.Hash)
	if err != nil {
		return File{}, nil, err
	}
	contents, err := os.Open(s.blob(hash))
	if err != nil {
		return File{}, nil, fmt.Errorf("open contents of file %s: %w", id, err)
	}
	return file, contents, nil
}

func (s *Store) Remove(ctx context.Context, id string) error {
	if !valid(id) {
		return ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var hash []byte
	err := s.Pool.QueryRow(ctx, `DELETE FROM game_data.files WHERE game_id=$1 AND file_id=$2 RETURNING sha256`, s.GameID, id).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("remove file: %w", err)
	}
	s.release(context.WithoutCancel(ctx), hash)
	return nil
}

func (s *Store) Sweep(ctx context.Context) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rows, err := s.Pool.Query(ctx, `SELECT DISTINCT encode(sha256,'hex') FROM game_data.files WHERE game_id=$1`, s.GameID)
	if err != nil {
		return 0, fmt.Errorf("list file contents: %w", err)
	}
	referenced := map[string]bool{}
	for rows.Next() {
		var hash string
		if err := rows.Scan(&hash); err != nil {
			rows.Close()
			return 0, err
		}
		referenced[hash] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	removed := 0
	folders, err := os.ReadDir(s.Folder)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	for _, folder := range folders {
		if !folder.IsDir() {
			continue
		}
		entries, err := os.ReadDir(filepath.Join(s.Folder, folder.Name()))
		if err != nil {
			return removed, err
		}
		for _, entry := range entries {
			path := filepath.Join(s.Folder, folder.Name(), entry.Name())
			if folder.Name() == temporaryFolder {
				if info, err := entry.Info(); err == nil && time.Since(info.ModTime()) > temporaryAge {
					if os.Remove(path) == nil {
						removed++
					}
				}
				continue
			}
			if len(folder.Name()) == 2 && !referenced[entry.Name()] {
				if os.Remove(path) == nil {
					removed++
				}
			}
		}
	}
	return removed, nil
}

func (s *Store) Missing(ctx context.Context) ([]File, error) {
	listed, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	missing := []File{}
	for _, file := range listed {
		hash, err := hex.DecodeString(file.Hash)
		if err != nil {
			return nil, err
		}
		if _, err := os.Stat(s.blob(hash)); err != nil {
			missing = append(missing, file)
		}
	}
	return missing, nil
}
