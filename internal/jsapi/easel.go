package jsapi

import (
	"fmt"
	"sort"

	"easel/internal/ident"
	"easel/internal/manifest"
	"github.com/grafana/sobek"
)

type implementation struct {
	id       string
	version  int
	host     string
	original bool
	pkg      manifest.Package
	file     string
	obj      sobek.Value
	library  *lazyLibrary
}

type lazyLibrary struct {
	pkg     manifest.Package
	entry   string
	loaded  bool
	loading bool
}

type interfaceGrant struct {
	host     string
	provides map[string]bool
}

func (bridge *EventBridge) installEasel() error {
	bridge.implementations = map[string][]*implementation{}
	bridge.interfaceGrants = map[string]interfaceGrant{}
	bridge.interfaces = bridge.vm.NewObject()
	if err := bridge.interfaces.DefineDataProperty("register", bridge.vm.ToValue(bridge.registerInterface), sobek.FLAG_FALSE, sobek.FLAG_TRUE, sobek.FLAG_TRUE); err != nil {
		return err
	}
	for name, method := range map[string]func(sobek.FunctionCall) sobek.Value{
		"supports": bridge.supportsInterface, "create": bridge.createInterface, "list": bridge.listInterface,
	} {
		if err := bridge.interfaces.DefineDataProperty(name, bridge.vm.ToValue(method), sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
			return err
		}
	}
	easel := bridge.vm.NewObject()
	if err := easel.DefineDataProperty("Interfaces", bridge.interfaces, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
		return err
	}
	if err := bridge.installRandom(easel); err != nil {
		return err
	}
	return bridge.vm.GlobalObject().DefineDataProperty("Easel", easel, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE)
}

func (bridge *EventBridge) RunModule(pkg manifest.Package, file string) (*sobek.Object, error) {
	return bridge.modules.Run(pkg, file)
}

func (bridge *EventBridge) GrantInterfaces(pkg manifest.Package) {
	grant := interfaceGrant{host: pkg.Manifest.Namespace(), provides: map[string]bool{}}
	for _, provided := range pkg.Manifest.Provides() {
		if provided.File == "" {
			grant.provides[provided.Key()] = provided.Original
		}
	}
	bridge.interfaceGrants[pkg.ID()] = grant
}

func (bridge *EventBridge) AddLazyInterfaces(pkg manifest.Package) error {
	for _, provided := range pkg.Manifest.Provides() {
		if provided.File == "" {
			continue
		}
		if err := bridge.addImplementation(&implementation{id: provided.ID, version: provided.Version, host: pkg.Manifest.Namespace(), original: provided.Original, pkg: pkg, file: provided.File}); err != nil {
			return fmt.Errorf("package %s: %w", pkg.ID(), err)
		}
	}
	return nil
}

func (bridge *EventBridge) CloseInterfaceRegistration() error {
	if err := bridge.interfaces.Delete("register"); err != nil {
		return fmt.Errorf("close interface registration: %w", err)
	}
	bridge.interfaceGrants = map[string]interfaceGrant{}
	return nil
}

func (bridge *EventBridge) addImplementation(candidate *implementation) error {
	key := candidate.key()
	for _, existing := range bridge.implementations[key] {
		if existing.host == candidate.host && existing.library != nil && existing.obj == nil && candidate.obj != nil && existing.library.loading {
			existing.obj = candidate.obj
			return nil
		}
		if existing.host == candidate.host {
			return fmt.Errorf("host %s already registered an implementation of interface %s", candidate.host, key)
		}
	}
	bridge.implementations[key] = append(bridge.implementations[key], candidate)
	return nil
}

func (bridge *EventBridge) registerInterface(call sobek.FunctionCall) sobek.Value {
	host := bridge.name(call.Argument(0))
	key := bridge.name(call.Argument(1))
	id, version, versioned := manifest.SplitVersion(key)
	if !versioned {
		bridge.fail(fmt.Errorf("register requires an interface version, such as %s@1", key))
	}
	class := call.Argument(2)
	grant, granted := bridge.interfaceGrants[bridge.owner]
	if !granted {
		bridge.fail(fmt.Errorf("package %s cannot register interfaces", bridge.owner))
	}
	if host != grant.host {
		bridge.fail(fmt.Errorf("package %s cannot register an implementation for host %s", bridge.owner, host))
	}
	original, allowed := grant.provides[key]
	if !allowed {
		bridge.fail(fmt.Errorf("package %s does not declare or implement interface %s in its library entry", bridge.owner, key))
	}
	if _, ok := sobek.AssertConstructor(class); !ok {
		bridge.fail(fmt.Errorf("implementation of interface %s must be a class", key))
	}
	if err := bridge.addImplementation(&implementation{id: id, version: version, host: host, original: original, obj: class}); err != nil {
		bridge.fail(err)
	}
	return sobek.Undefined()
}

func (candidate *implementation) key() string {
	return manifest.Versioned(candidate.id, candidate.version)
}

func (bridge *EventBridge) class(candidate *implementation) sobek.Value {
	if candidate.obj != nil {
		return candidate.obj
	}
	if candidate.library != nil {
		bridge.loadLibrary(candidate.library)
		if candidate.obj == nil {
			bridge.fail(fmt.Errorf("global library %s did not register interface %s", candidate.library.pkg.ID(), candidate.key()))
		}
		return candidate.obj
	}
	previous := bridge.owner
	bridge.owner = candidate.pkg.ID()
	namespace, err := bridge.modules.Run(candidate.pkg, candidate.file)
	bridge.owner = previous
	if err != nil {
		bridge.fail(fmt.Errorf("load implementation of interface %s from %s: %w", candidate.key(), candidate.host, err))
	}
	class := namespace.Get("default")
	if _, ok := sobek.AssertConstructor(class); !ok {
		bridge.fail(fmt.Errorf("%s/%s must export a default class implementing interface %s", candidate.pkg.ID(), candidate.file, candidate.key()))
	}
	candidate.obj = class
	return class
}

func (bridge *EventBridge) versionedName(value sobek.Value) string {
	key := bridge.name(value)
	if base, _, versioned := manifest.SplitVersion(key); !versioned || !ident.Qualified(base) {
		bridge.fail(fmt.Errorf("interface %s requires owner.host.member and a version, such as %s@1", key, key))
	}
	return key
}

func (bridge *EventBridge) prioritized(key string) []*implementation {
	ordered := []*implementation{}
	for _, candidate := range bridge.implementations[key] {
		if candidate.original {
			ordered = append(ordered, candidate)
		}
	}
	for _, candidate := range bridge.implementations[key] {
		if !candidate.original {
			ordered = append(ordered, candidate)
		}
	}
	return ordered
}

func (bridge *EventBridge) supportsInterface(call sobek.FunctionCall) sobek.Value {
	return bridge.vm.ToValue(len(bridge.implementations[bridge.versionedName(call.Argument(0))]))
}

func (bridge *EventBridge) listInterface(call sobek.FunctionCall) sobek.Value {
	requested := bridge.name(call.Argument(0))
	keys := []string{requested}
	if _, _, versioned := manifest.SplitVersion(requested); !versioned {
		keys = []string{}
		versions := []int{}
		for key := range bridge.implementations {
			if id, version, _ := manifest.SplitVersion(key); id == requested {
				versions = append(versions, version)
			}
		}
		sort.Ints(versions)
		for _, version := range versions {
			keys = append(keys, manifest.Versioned(requested, version))
		}
	}
	entries := []any{}
	for _, key := range keys {
		for _, candidate := range bridge.prioritized(key) {
			candidate := candidate
			entry := bridge.vm.NewObject()
			for name, value := range map[string]any{"name": candidate.id, "version": candidate.version, "host": candidate.host} {
				if err := entry.Set(name, value); err != nil {
					bridge.fail(err)
				}
			}
			getter := bridge.vm.ToValue(func(sobek.FunctionCall) sobek.Value { return bridge.class(candidate) })
			if err := entry.DefineAccessorProperty("obj", getter, nil, sobek.FLAG_FALSE, sobek.FLAG_TRUE); err != nil {
				bridge.fail(err)
			}
			entries = append(entries, entry)
		}
	}
	return bridge.vm.NewArray(entries...)
}

func (bridge *EventBridge) createInterface(call sobek.FunctionCall) sobek.Value {
	key := bridge.versionedName(call.Argument(0))
	candidates := bridge.prioritized(key)
	if len(candidates) == 0 {
		bridge.fail(fmt.Errorf("no implementation of interface %s is registered", key))
	}
	chosen := candidates[0]
	if host := call.Argument(1); !sobek.IsUndefined(host) {
		name := bridge.name(host)
		chosen = nil
		for _, candidate := range candidates {
			if candidate.host == name {
				chosen = candidate
			}
		}
		if chosen == nil {
			bridge.fail(fmt.Errorf("host %s has no implementation of interface %s", name, key))
		}
	}
	constructor, _ := sobek.AssertConstructor(bridge.class(chosen))
	instance, err := constructor(nil)
	if err != nil {
		bridge.fail(err)
	}
	return instance
}

func (bridge *EventBridge) AddLazyLibrary(pkg manifest.Package, entry string) error {
	library := &lazyLibrary{pkg: pkg, entry: entry}
	for _, provided := range pkg.Manifest.Provides() {
		if provided.File != "" {
			continue
		}
		if err := bridge.addImplementation(&implementation{id: provided.ID, version: provided.Version, host: pkg.Manifest.Namespace(), original: provided.Original, pkg: pkg, library: library}); err != nil {
			return fmt.Errorf("package %s: %w", pkg.ID(), err)
		}
	}
	return bridge.AddLazyInterfaces(pkg)
}

func (bridge *EventBridge) loadLibrary(library *lazyLibrary) {
	if library.loaded {
		return
	}
	if library.loading {
		bridge.fail(fmt.Errorf("global library %s is already loading", library.pkg.ID()))
	}
	library.loading = true
	previousOwner, previousGrants := bridge.owner, bridge.interfaceGrants
	bridge.interfaceGrants = map[string]interfaceGrant{}
	bridge.GrantInterfaces(library.pkg)
	reopened := bridge.interfaces.Get("register") == nil
	if reopened {
		if err := bridge.interfaces.DefineDataProperty("register", bridge.vm.ToValue(bridge.registerInterface), sobek.FLAG_FALSE, sobek.FLAG_TRUE, sobek.FLAG_TRUE); err != nil {
			bridge.fail(err)
		}
	}
	bridge.owner = library.pkg.ID()
	_, err := bridge.modules.Run(library.pkg, library.entry)
	bridge.owner = previousOwner
	bridge.interfaceGrants = previousGrants
	if reopened {
		_ = bridge.interfaces.Delete("register")
	}
	library.loading = false
	if err != nil {
		bridge.fail(fmt.Errorf("load global library %s: %w", library.pkg.ID(), err))
	}
	library.loaded = true
}
