package manifest

import (
	"fmt"
	"sort"
)

type Entry struct {
	Package Package
	Path    string
}

type ClientEntry struct {
	Package Package
	Entries map[string]string
}

type Plan struct {
	Application       Package
	Packages          []Package
	Security          []Entry
	Library           []Entry
	Startup           []Entry
	ClientLibrary     []ClientEntry
	ClientApplication []ClientEntry
	Clients           []string
}

type stageInfo struct {
	required Requirements
	entry    string
	entries  map[string]string
}

type stageKind struct {
	name     string
	client   bool
	waits    bool
	provides func(Manifest) []Provided
	get      func(Manifest) (stageInfo, bool)
}

func serverStage(name string, waits bool, get func(Server) *Stage) stageKind {
	return stageKind{name: "server " + name, waits: waits, provides: Manifest.Provides, get: func(m Manifest) (stageInfo, bool) {
		stage := get(m.Server)
		if stage == nil {
			return stageInfo{}, false
		}
		return stageInfo{required: stage.Required, entry: stage.Entry}, true
	}}
}

func clientStage(name string, waits bool, get func(Client) *ClientStage) stageKind {
	return stageKind{name: "client " + name, client: true, waits: waits, provides: Manifest.ClientProvides, get: func(m Manifest) (stageInfo, bool) {
		stage := get(m.Client)
		if stage == nil {
			return stageInfo{}, false
		}
		return stageInfo{required: stage.Required, entries: stage.Entries}, true
	}}
}

var (
	stageSecurity          = serverStage("security", false, func(s Server) *Stage { return s.Security })
	stageLibrary           = serverStage("library", true, func(s Server) *Stage { return s.Library })
	stageApplication       = serverStage("application", false, func(s Server) *Stage { return s.Application })
	stageClientLibrary     = clientStage("library", true, func(c Client) *ClientStage { return c.Library })
	stageClientApplication = clientStage("application", false, func(c Client) *ClientStage { return c.Application })
	allStages              = []stageKind{stageSecurity, stageLibrary, stageApplication, stageClientLibrary, stageClientApplication}
)

type interfaceIndex struct {
	declared  map[string]bool
	providers map[string][]Package
}

func indexInterfaces(packages []Package, side string, provides func(Manifest) []Provided) (interfaceIndex, error) {
	index := interfaceIndex{declared: map[string]bool{}, providers: map[string][]Package{}}
	declarers := map[string]Package{}
	add := func(key string, p Package) {
		for _, existing := range index.providers[key] {
			if existing.ID() == p.ID() {
				return
			}
		}
		index.providers[key] = append(index.providers[key], p)
	}
	for _, p := range packages {
		for _, provided := range provides(p.Manifest) {
			if !provided.Original {
				continue
			}
			if existing, found := declarers[provided.ID]; found && existing.ID() != p.ID() {
				return index, fmt.Errorf("%s interface %s is declared by both %s and %s", side, provided.ID, existing.ID(), p.ID())
			}
			declarers[provided.ID] = p
			index.declared[provided.Key()] = true
			add(provided.Key(), p)
		}
	}
	for _, p := range packages {
		for _, provided := range provides(p.Manifest) {
			if provided.Original {
				continue
			}
			if !index.declared[provided.Key()] {
				return index, fmt.Errorf("%s implements %s interface %s, which no package declares", p.ID(), side, provided.Key())
			}
			add(provided.Key(), p)
		}
	}
	return index, nil
}

func Resolve(packages []Package) (Plan, error) {
	byID := map[string]Package{}
	var application *Package
	for index, p := range packages {
		id := p.ID()
		if _, found := byID[id]; found {
			return Plan{}, fmt.Errorf("duplicate package %s", id)
		}
		byID[id] = p
		if p.Manifest.Type == TypeApplication {
			if application != nil {
				return Plan{}, fmt.Errorf("packages %s and %s are both applications", application.ID(), id)
			}
			application = &packages[index]
		}
	}
	if application == nil {
		return Plan{}, fmt.Errorf("exactly one application package is required")
	}
	plan := Plan{Application: *application, Packages: []Package{*application}}
	for _, p := range packages {
		if p.ID() != application.ID() {
			plan.Packages = append(plan.Packages, p)
		}
	}
	server, err := indexInterfaces(packages, "server", Manifest.Provides)
	if err != nil {
		return Plan{}, err
	}
	client, err := indexInterfaces(packages, "client", Manifest.ClientProvides)
	if err != nil {
		return Plan{}, err
	}
	for _, side := range []struct {
		name     string
		index    interfaceIndex
		provides func(Manifest) []Provided
	}{{"server", server, Manifest.Provides}, {"client", client, Manifest.ClientProvides}} {
		for _, p := range packages {
			for _, provided := range side.provides(p.Manifest) {
				for _, id := range provided.Required.Modules {
					if _, found := byID[id]; !found {
						return Plan{}, fmt.Errorf("%s %s interface %s requires module %s, which is not installed", p.ID(), side.name, provided.Key(), id)
					}
				}
				for _, id := range provided.Required.Interfaces {
					if !side.index.declared[id] {
						return Plan{}, fmt.Errorf("%s %s interface %s requires interface %s, which no package declares", p.ID(), side.name, provided.Key(), id)
					}
				}
			}
		}
	}
	indexes := map[string]interfaceIndex{}
	for _, kind := range allStages {
		index := server
		if kind.client {
			index = client
		}
		indexes[kind.name] = index
		for _, p := range packages {
			info, present := kind.get(p.Manifest)
			if !present {
				continue
			}
			for _, id := range info.required.Modules {
				if _, found := byID[id]; !found {
					return Plan{}, fmt.Errorf("%s %s requires module %s, which is not installed", p.ID(), kind.name, id)
				}
			}
			for _, id := range info.required.Interfaces {
				if !index.declared[id] {
					return Plan{}, fmt.Errorf("%s %s requires interface %s, which no package declares", p.ID(), kind.name, id)
				}
			}
		}
	}
	ordered := map[string][]orderedEntry{}
	for _, kind := range allStages {
		entries, err := order(packages, *application, byID, indexes[kind.name], kind)
		if err != nil {
			return Plan{}, err
		}
		ordered[kind.name] = entries
	}
	for _, entry := range ordered[stageSecurity.name] {
		plan.Security = append(plan.Security, Entry{Package: entry.pkg, Path: entry.info.entry})
	}
	for _, entry := range ordered[stageLibrary.name] {
		plan.Library = append(plan.Library, Entry{Package: entry.pkg, Path: entry.info.entry})
	}
	for _, entry := range ordered[stageApplication.name] {
		plan.Startup = append(plan.Startup, Entry{Package: entry.pkg, Path: entry.info.entry})
	}
	for _, entry := range ordered[stageClientLibrary.name] {
		plan.ClientLibrary = append(plan.ClientLibrary, ClientEntry{Package: entry.pkg, Entries: entry.info.entries})
	}
	for _, entry := range ordered[stageClientApplication.name] {
		plan.ClientApplication = append(plan.ClientApplication, ClientEntry{Package: entry.pkg, Entries: entry.info.entries})
	}
	plan.Clients = supportedClients(plan.Packages, append(append([]ClientEntry(nil), plan.ClientLibrary...), plan.ClientApplication...))
	validateClients := map[string]bool{}
	hasFiles := true
	for _, p := range packages {
		if p.Files == nil {
			hasFiles = false
		}
		for client := range p.Manifest.Client.Assets {
			validateClients[client] = true
		}
	}
	for _, client := range plan.Clients {
		validateClients[client] = true
	}
	for client := range validateClients {
		if !hasFiles {
			break
		}
		if _, err := plan.Delivery(client); err != nil {
			return Plan{}, err
		}
	}
	return plan, nil
}

func supportedClients(packages []Package, entries []ClientEntry) []string {
	sets := []map[string]string{}
	for _, entry := range entries {
		sets = append(sets, entry.Entries)
	}
	for _, p := range packages {
		library := map[string]string{}
		if p.Manifest.Client.Library != nil {
			library = p.Manifest.Client.Library.Entries
		}
		for _, provided := range p.Manifest.ClientProvides() {
			if len(provided.Entries) == 0 {
				continue
			}
			set := map[string]string{}
			for kind, file := range library {
				set[kind] = file
			}
			for kind, file := range provided.Entries {
				set[kind] = file
			}
			sets = append(sets, set)
		}
	}
	if len(sets) == 0 {
		return []string{}
	}
	counts := map[string]int{}
	for _, set := range sets {
		for kind := range set {
			counts[kind]++
		}
	}
	supported := []string{}
	for kind, count := range counts {
		if count == len(sets) {
			supported = append(supported, kind)
		}
	}
	sort.Strings(supported)
	return supported
}

type orderedEntry struct {
	pkg  Package
	info stageInfo
}

func order(packages []Package, application Package, byID map[string]Package, index interfaceIndex, kind stageKind) ([]orderedEntry, error) {
	entries := []orderedEntry{}
	done := map[string]bool{}
	visiting := map[string]bool{}
	var visit func(p Package, path []string) error
	visit = func(p Package, path []string) error {
		id := p.ID()
		if done[id] {
			return nil
		}
		info, present := kind.get(p.Manifest)
		if !present {
			done[id] = true
			return nil
		}
		if visiting[id] {
			return fmt.Errorf("%s requirement cycle: %v", kind.name, append(path, id))
		}
		visiting[id] = true
		dependencies := append([]string(nil), info.required.Modules...)
		if kind.waits {
			for _, required := range info.required.Interfaces {
				for _, provider := range index.providers[required] {
					dependencies = append(dependencies, provider.ID())
				}
			}
		}
		for _, dependency := range dependencies {
			if dependency == id {
				continue
			}
			if err := visit(byID[dependency], append(path, id)); err != nil {
				return err
			}
		}
		visiting[id] = false
		done[id] = true
		entries = append(entries, orderedEntry{pkg: p, info: info})
		return nil
	}
	if err := visit(application, nil); err != nil {
		return nil, err
	}
	for _, p := range packages {
		if err := visit(p, nil); err != nil {
			return nil, err
		}
	}
	return entries, nil
}
