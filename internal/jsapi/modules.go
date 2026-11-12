package jsapi

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"strings"

	"easel/internal/manifest"
	"github.com/grafana/sobek"
)

type moduleLocation struct {
	pkg  manifest.Package
	path string
}

type ModuleLoader struct {
	vm        *sobek.Runtime
	cache     map[string]sobek.ModuleRecord
	locations map[sobek.ModuleRecord]moduleLocation
}

func NewModuleLoader(vm *sobek.Runtime) *ModuleLoader {
	return &ModuleLoader{vm: vm, cache: map[string]sobek.ModuleRecord{}, locations: map[sobek.ModuleRecord]moduleLocation{}}
}

func (loader *ModuleLoader) Run(pkg manifest.Package, file string) (*sobek.Object, error) {
	if pkg.Manifest.Encrypt.Enabled {
		return nil, fmt.Errorf("package %s is encrypted; encrypted packages are not supported yet", pkg.ID())
	}
	record, err := loader.load(pkg, file)
	if err != nil {
		return nil, err
	}
	if err := record.Link(); err != nil {
		return nil, fmt.Errorf("link %s/%s: %w", pkg.ID(), file, err)
	}
	promise := loader.vm.CyclicModuleRecordEvaluate(record.(sobek.CyclicModuleRecord), loader.resolve)
	switch promise.State() {
	case sobek.PromiseStateRejected:
		return nil, fmt.Errorf("run %s/%s: %w", pkg.ID(), file, rejection(promise.Result()))
	case sobek.PromiseStatePending:
		return nil, fmt.Errorf("run %s/%s: module did not finish evaluating", pkg.ID(), file)
	}
	return loader.vm.NamespaceObjectFor(record), nil
}

func (loader *ModuleLoader) load(pkg manifest.Package, file string) (sobek.ModuleRecord, error) {
	key := pkg.ID() + "\x00" + file
	if record, found := loader.cache[key]; found {
		return record, nil
	}
	if pkg.Files == nil {
		return nil, fmt.Errorf("package %s has no files", pkg.ID())
	}
	source, err := fs.ReadFile(pkg.Files, file)
	if err != nil {
		return nil, fmt.Errorf("read %s/%s: %w", pkg.ID(), file, err)
	}
	record, err := sobek.ParseModule(pkg.ID()+"/"+file, string(source), loader.resolve)
	if err != nil {
		return nil, fmt.Errorf("parse %s/%s: %w", pkg.ID(), file, err)
	}
	loader.cache[key] = record
	loader.locations[record] = moduleLocation{pkg: pkg, path: file}
	return record, nil
}

func (loader *ModuleLoader) resolve(referencing interface{}, specifier string) (sobek.ModuleRecord, error) {
	from, ok := referencing.(sobek.ModuleRecord)
	location, known := loader.locations[from]
	if !ok || !known {
		return nil, fmt.Errorf("import %q has no referencing module", specifier)
	}
	if !strings.HasPrefix(specifier, "./") && !strings.HasPrefix(specifier, "../") {
		return nil, fmt.Errorf("import %q in %s/%s: imports must be relative paths inside the package", specifier, location.pkg.ID(), location.path)
	}
	target := path.Join(path.Dir(location.path), specifier)
	if !fs.ValidPath(target) || strings.HasPrefix(target, "../") {
		return nil, fmt.Errorf("import %q in %s/%s leaves the package", specifier, location.pkg.ID(), location.path)
	}
	return loader.load(location.pkg, target)
}

func rejection(value sobek.Value) error {
	if err, ok := value.Export().(error); ok {
		return interruptCause(err)
	}
	return errors.New(value.String())
}

func interruptCause(err error) error {
	var interrupted *sobek.InterruptedError
	if errors.As(err, &interrupted) {
		if cause, ok := interrupted.Value().(error); ok {
			return cause
		}
	}
	return err
}

func interruptible(ctx context.Context, vm *sobek.Runtime, run func() error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	done := make(chan struct{})
	joined := make(chan struct{})
	go func() {
		defer close(joined)
		select {
		case <-ctx.Done():
			vm.Interrupt(ctx.Err())
		case <-done:
		}
	}()
	err := run()
	close(done)
	<-joined
	vm.ClearInterrupt()
	return interruptCause(err)
}

func (loader *ModuleLoader) exports(packageID string) []any {
	values := []any{}
	for record, location := range loader.locations {
		if location.pkg.ID() != packageID {
			continue
		}
		namespace := loader.vm.NamespaceObjectFor(record)
		for _, key := range namespace.Keys() {
			values = append(values, namespace.Get(key))
		}
	}
	return values
}
