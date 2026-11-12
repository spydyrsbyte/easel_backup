package platform

import (
	"bytes"
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

	"easel/internal/manifest"
)

const ConfigFile = "server.json"

type Definition struct {
	Server    manifest.Package
	Modules   []manifest.Package
	Libraries []manifest.Package
}

func (d *Definition) Packages() []manifest.Package {
	return append([]manifest.Package{d.Server}, d.Modules...)
}

type config struct {
	Startup string `json:"startup"`
	Library []struct {
		Name     string `json:"name"`
		Manifest string `json:"manifest"`
	} `json:"library"`
}

func decodeStrict(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing data after JSON value")
	}
	return nil
}

func loadPackage(dir, relative string) (manifest.Package, error) {
	cleaned, err := manifest.CleanPath(relative)
	if err != nil {
		return manifest.Package{}, err
	}
	if path.Base(cleaned) != manifest.FileName {
		return manifest.Package{}, fmt.Errorf("%s must name a %s", relative, manifest.FileName)
	}
	root := filepath.Join(dir, filepath.FromSlash(path.Dir(cleaned)))
	pkg, err := manifest.Load(os.DirFS(root))
	if err != nil {
		return manifest.Package{}, fmt.Errorf("load %s: %w", relative, err)
	}
	return pkg, nil
}

func Load(dir string) (*Definition, error) {
	data, err := os.ReadFile(filepath.Join(dir, ConfigFile))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", ConfigFile, err)
	}
	var settings config
	if err := decodeStrict(data, &settings); err != nil {
		return nil, fmt.Errorf("invalid %s: %w", ConfigFile, err)
	}
	if settings.Startup == "" {
		return nil, fmt.Errorf("%s requires startup", ConfigFile)
	}
	server, err := loadPackage(dir, settings.Startup)
	if err != nil {
		return nil, fmt.Errorf("startup: %w", err)
	}
	if server.Manifest.Type != manifest.TypeApplication {
		return nil, fmt.Errorf("startup %s must be an application", server.ID())
	}
	definition := &Definition{Server: server}
	startup, _ := manifest.CleanPath(settings.Startup)
	modules, err := loadFolder(filepath.Join(dir, filepath.FromSlash(path.Dir(startup)), "modules"))
	if err != nil {
		return nil, fmt.Errorf("server modules: %w", err)
	}
	for _, id := range sortedIDs(modules) {
		if modules[id].Manifest.Type == manifest.TypeApplication {
			return nil, fmt.Errorf("server module %s cannot be an application", id)
		}
		definition.Modules = append(definition.Modules, modules[id])
	}
	catalogModules, err := loadFolder(filepath.Join(filepath.Dir(dir), "modules"))
	if err != nil {
		return nil, fmt.Errorf("catalog modules: %w", err)
	}
	tempCatalog := &Catalog{Modules: catalogModules}
	seen := map[string]bool{}
	for _, entry := range settings.Library {
		library, err := loadPackage(dir, entry.Manifest)
		if err != nil {
			return nil, fmt.Errorf("library %s: %w", entry.Name, err)
		}
		if library.Manifest.Name != entry.Name {
			return nil, fmt.Errorf("library %s: manifest is named %s", entry.Name, library.Manifest.Name)
		}
		if library.Manifest.Type == manifest.TypeApplication {
			return nil, fmt.Errorf("library %s: a global library cannot be an application", entry.Name)
		}
		if seen[library.ID()] {
			return nil, fmt.Errorf("library %s is listed twice", library.ID())
		}
		seen[library.ID()] = true
		for _, depID := range tempCatalog.requiredModules(library) {
			if dep, ok := catalogModules[depID]; ok {
				library.Dependencies = append(library.Dependencies, dep)
			}
		}
		definition.Libraries = append(definition.Libraries, library)
	}
	return definition, nil
}

type Catalog struct {
	Applications map[string]manifest.Package
	Modules      map[string]manifest.Package
}

func loadFolder(dir string) (map[string]manifest.Package, error) {
	packages := map[string]manifest.Package{}
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return packages, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", dir, err)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		pkg, err := manifest.Load(os.DirFS(filepath.Join(dir, entry.Name())))
		if err != nil {
			return nil, fmt.Errorf("installed package %s: %w", entry.Name(), err)
		}
		if _, found := packages[pkg.ID()]; found {
			return nil, fmt.Errorf("package %s is installed twice", pkg.ID())
		}
		packages[pkg.ID()] = pkg
	}
	return packages, nil
}

func LoadCatalog(easelDir string) (*Catalog, error) {
	applications, err := loadFolder(filepath.Join(easelDir, "applications"))
	if err != nil {
		return nil, err
	}
	modules, err := loadFolder(filepath.Join(easelDir, "modules"))
	if err != nil {
		return nil, err
	}
	for id, pkg := range applications {
		if pkg.Manifest.Type != manifest.TypeApplication {
			return nil, fmt.Errorf("%s is in applications but is a %s", id, pkg.Manifest.Type)
		}
	}
	for id, pkg := range modules {
		if pkg.Manifest.Type == manifest.TypeApplication {
			return nil, fmt.Errorf("%s is in modules but is an application", id)
		}
	}
	return &Catalog{Applications: applications, Modules: modules}, nil
}

func (c *Catalog) Packages(application string, modules []string) ([]manifest.Package, error) {
	app, found := c.Applications[application]
	if !found {
		if strings.Count(application, ".") == 1 {
			return nil, fmt.Errorf("application %s uses a legacy two-part identity; convert the saved game to owner.host.member before starting it", application)
		}
		return nil, fmt.Errorf("application %s is not installed", application)
	}
	packages := []manifest.Package{app}
	seen := map[string]bool{application: true}
	queue := append(append([]string(nil), modules...), c.requiredModules(app)...)
	for index := 0; index < len(queue); index++ {
		id := queue[index]
		if seen[id] {
			continue
		}
		pkg, found := c.Modules[id]
		if !found {
			return nil, fmt.Errorf("module %s is not installed", id)
		}
		seen[id] = true
		packages = append(packages, pkg)
		queue = append(queue, c.requiredModules(pkg)...)
	}
	return packages, nil
}

func sortedIDs(packages map[string]manifest.Package) []string {
	ids := make([]string, 0, len(packages))
	for id := range packages {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

type InstalledApplication struct {
	ID       string   `json:"id"`
	Requires []string `json:"requires"`
}

type Installed struct {
	Applications []InstalledApplication `json:"applications"`
	Modules      []string               `json:"modules"`
}

func (c *Catalog) requiredModules(pkg manifest.Package) []string {
	found := []string{}
	seen := map[string]bool{}
	var visit func(manifest.Package)
	add := func(required manifest.Requirements) {
		for _, id := range required.Modules {
			if seen[id] {
				continue
			}
			seen[id] = true
			found = append(found, id)
			if module, installed := c.Modules[id]; installed {
				visit(module)
			}
		}
	}
	visit = func(pkg manifest.Package) {
		for _, stage := range []*manifest.Stage{pkg.Manifest.Server.Library, pkg.Manifest.Server.Security, pkg.Manifest.Server.Application} {
			if stage != nil {
				add(stage.Required)
			}
		}
		for _, stage := range []*manifest.ClientStage{pkg.Manifest.Client.Library, pkg.Manifest.Client.Application} {
			if stage != nil {
				add(stage.Required)
			}
		}
		for _, provided := range append(pkg.Manifest.Provides(), pkg.Manifest.ClientProvides()...) {
			add(provided.Required)
		}
	}
	visit(pkg)
	return found
}

func (c *Catalog) Installed() Installed {
	installed := Installed{Applications: []InstalledApplication{}, Modules: sortedIDs(c.Modules)}
	for _, id := range sortedIDs(c.Applications) {
		installed.Applications = append(installed.Applications, InstalledApplication{ID: id, Requires: c.requiredModules(c.Applications[id])})
	}
	return installed
}
