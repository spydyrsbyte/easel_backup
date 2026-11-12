package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"easel/internal/ident"
)

var (
	ErrNotFound   = errors.New("automation not found")
	ErrDenied     = errors.New("automation access denied")
	ErrPostCommit = errors.New("automation committed, but a post-commit event failed")
)

type FileRepository struct {
	Directory string
	mutex     sync.Mutex
}

func (repository *FileRepository) path(name string) (string, error) {
	if !ident.Valid(name) {
		return "", fmt.Errorf("invalid automation name %q", name)
	}
	return filepath.Join(repository.Directory, name+".json"), nil
}

func (repository *FileRepository) Save(ctx context.Context, saved Saved) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := Validate(saved.Definition); err != nil {
		return err
	}
	if err := saved.Creator.Validate(); err != nil {
		return err
	}
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	path, err := repository.path(saved.Definition.Name)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(repository.Directory, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(saved, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(repository.Directory, ".automation-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func (repository *FileRepository) Load(ctx context.Context, name string) (Saved, error) {
	if err := ctx.Err(); err != nil {
		return Saved{}, err
	}
	path, err := repository.path(name)
	if err != nil {
		return Saved{}, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Saved{}, fmt.Errorf("%w: %s", ErrNotFound, name)
	}
	if err != nil {
		return Saved{}, err
	}
	var saved Saved
	if err := Decode(data, &saved); err != nil {
		return Saved{}, err
	}
	if saved.Definition.Name != name {
		return Saved{}, fmt.Errorf("automation filename/name mismatch")
	}
	return saved, Validate(saved.Definition)
}

func (repository *FileRepository) List(ctx context.Context) ([]Saved, error) {
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	entries, err := os.ReadDir(repository.Directory)
	if errors.Is(err, os.ErrNotExist) {
		return []Saved{}, nil
	}
	if err != nil {
		return nil, err
	}
	result := []Saved{}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		name := entry.Name()[:len(entry.Name())-5]
		saved, err := repository.Load(ctx, name)
		if err != nil {
			return nil, err
		}
		result = append(result, saved)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Definition.Name < result[j].Definition.Name })
	return result, nil
}

func (repository *FileRepository) Delete(ctx context.Context, name string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	repository.mutex.Lock()
	defer repository.mutex.Unlock()
	path, err := repository.path(name)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("%w: %s", ErrNotFound, name)
	}
	return err
}
