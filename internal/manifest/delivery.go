package manifest

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"path"
	"strings"
)

type ClientResource struct {
	Data []byte
	Hash string
}

type ClientInterface struct {
	Name           string   `json:"name"`
	URL            string   `json:"url"`
	Implementation string   `json:"implementation,omitempty"`
	Requires       []string `json:"requires,omitempty"`
}

type ClientPackage struct {
	ID                  string            `json:"id"`
	Host                string            `json:"host"`
	Version             Version           `json:"version"`
	BaseURL             string            `json:"baseUrl"`
	Interfaces          []ClientInterface `json:"interfaces"`
	Implements          []string          `json:"implements"`
	LibraryEntry        string            `json:"libraryEntry,omitempty"`
	ApplicationEntry    string            `json:"applicationEntry,omitempty"`
	LibraryRequires     []string          `json:"libraryRequires,omitempty"`
	ApplicationRequires []string          `json:"applicationRequires,omitempty"`
}

type Delivery struct {
	Packages    []ClientPackage           `json:"packages"`
	Library     []string                  `json:"libraryOrder"`
	Application []string                  `json:"applicationOrder"`
	Resources   map[string]ClientResource `json:"-"`
}

func (p Plan) Delivery(kind string) (Delivery, error) {
	d := Delivery{Packages: []ClientPackage{}, Library: []string{}, Application: []string{}, Resources: map[string]ClientResource{}}
	for _, pkg := range p.Packages {
		m := pkg.Manifest
		key := pkg.ID() + "-" + m.Version.String()
		base := "/assets/" + key + "/"
		out := ClientPackage{ID: pkg.ID(), Host: m.Namespace(), Version: m.Version, BaseURL: base, Interfaces: []ClientInterface{}, Implements: []string{}}
		blocked := append([]string{FileName}, pkg.PrivateFiles...)
		for _, s := range []*Stage{m.Server.Library, m.Server.Security, m.Server.Application} {
			if s != nil {
				blocked = append(blocked, s.Entry)
			}
		}
		for _, i := range append(append([]Interface{}, m.Server.Interfaces...), m.Server.Implements...) {
			if i.File != "" {
				blocked = append(blocked, i.File)
			}
		}
		add := func(file string) error {
			clean, err := CleanPath(file)
			if err != nil {
				return err
			}
			for _, b := range blocked {
				if clean == b {
					return fmt.Errorf("%s client asset exposes server-only file %s", pkg.ID(), clean)
				}
			}
			if err := noSymlinks(pkg.Files, clean); err != nil {
				return err
			}
			data, err := fs.ReadFile(pkg.Files, clean)
			if err != nil {
				return fmt.Errorf("%s client resource %s: %w", pkg.ID(), clean, err)
			}
			hash := sha256.Sum256(data)
			d.Resources[base+clean] = ClientResource{Data: data, Hash: hex.EncodeToString(hash[:])}
			return nil
		}
		for client, dirs := range m.Client.Assets {
			if !clientEntry.MatchString(client + "-entry") {
				return d, fmt.Errorf("%s invalid asset client %s", pkg.ID(), client)
			}
			for _, dir := range dirs {
				clean, err := CleanPath(dir)
				if err != nil {
					return d, err
				}
				if err = noSymlinks(pkg.Files, clean); err != nil {
					return d, err
				}
				for _, b := range blocked {
					if b == clean || strings.HasPrefix(b, clean+"/") {
						return d, fmt.Errorf("%s assets expose server-only path %s", pkg.ID(), b)
					}
				}
				info, err := fs.Stat(pkg.Files, clean)
				if err != nil {
					return d, err
				}
				if !info.IsDir() {
					return d, fmt.Errorf("asset %s must be a directory", clean)
				}
				err = fs.WalkDir(pkg.Files, clean, func(file string, e fs.DirEntry, err error) error {
					if err != nil {
						return err
					}
					if e.Type()&fs.ModeSymlink != 0 {
						return fmt.Errorf("symlink asset %s", file)
					}
					if !e.IsDir() && client == kind {
						return add(file)
					}
					return nil
				})
				if err != nil {
					return d, err
				}
			}
		}
		for _, provided := range m.ClientProvides() {
			if err := add(provided.File); err != nil {
				return d, err
			}
			item := ClientInterface{Name: provided.Key(), URL: base + provided.File}
			if entry := provided.Entries[kind]; entry != "" {
				if err := add(entry); err != nil {
					return d, err
				}
				item.Implementation = base + entry
				item.Requires = provided.Required.Interfaces
			} else {
				out.Implements = append(out.Implements, provided.Key())
			}
			out.Interfaces = append(out.Interfaces, item)
		}
		if m.Client.Library != nil {
			if entry := m.Client.Library.Entries[kind]; entry != "" {
				if err := add(entry); err != nil {
					return d, err
				}
				out.LibraryEntry = base + entry
				out.LibraryRequires = m.Client.Library.Required.Interfaces
			}
		}
		if m.Client.Application != nil {
			if entry := m.Client.Application.Entries[kind]; entry != "" {
				if err := add(entry); err != nil {
					return d, err
				}
				out.ApplicationEntry = base + entry
				out.ApplicationRequires = m.Client.Application.Required.Interfaces
			}
		}
		d.Packages = append(d.Packages, out)
	}
	for _, e := range p.ClientLibrary {
		if e.Entries[kind] != "" {
			d.Library = append(d.Library, e.Package.ID())
		}
	}
	for _, e := range p.ClientApplication {
		if e.Entries[kind] != "" {
			d.Application = append(d.Application, e.Package.ID())
		}
	}
	return d, nil
}

func noSymlinks(files fs.FS, file string) error {
	if files == nil {
		return fmt.Errorf("client resources require package files")
	}
	parent := "."
	for _, part := range strings.Split(file, "/") {
		entries, err := fs.ReadDir(files, parent)
		if err != nil {
			return err
		}
		found := false
		for _, e := range entries {
			if e.Name() == part {
				found = true
				if e.Type()&fs.ModeSymlink != 0 {
					return fmt.Errorf("client path contains symlink: %s", file)
				}
				break
			}
		}
		if !found {
			return fmt.Errorf("missing client path %s", file)
		}
		parent = path.Join(parent, part)
	}
	return nil
}
