package manifest

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"path"
	"regexp"
	"strconv"
	"strings"

	"easel/internal/ident"
)

const FileName = "manifest.json"

const (
	TypeApplication = "application"
	TypeModule      = "module"
	TypeKit         = "kit"
)

type Manifest struct {
	Owner       string             `json:"owner"`
	Type        string             `json:"type"`
	Name        string             `json:"name"`
	Title       string             `json:"title,omitempty"`
	Description string             `json:"description,omitempty"`
	Authors     []Author           `json:"authors,omitempty"`
	Host        string             `json:"host"`
	Version     Version            `json:"version"`
	Encrypt     Encryption         `json:"encrypt"`
	Channels    map[string]Channel `json:"channels,omitempty"`
	Server      Server             `json:"-"`
	Client      Client             `json:"-"`
}

type Server struct {
	Library     *Stage            `json:"library,omitempty"`
	Security    *Stage            `json:"security,omitempty"`
	Application *Stage            `json:"application,omitempty"`
	Interfaces  []Interface       `json:"interfaces,omitempty"`
	Implements  []Interface       `json:"implements,omitempty"`
	Data        []json.RawMessage `json:"data,omitempty"`
}

type Client struct {
	Assets      map[string][]string `json:"assets,omitempty"`
	Library     *ClientStage        `json:"library,omitempty"`
	Application *ClientStage        `json:"application,omitempty"`
	Interfaces  []Interface         `json:"interfaces,omitempty"`
	Implements  []Interface         `json:"implements,omitempty"`
}

type ClientStage struct {
	Entries  map[string]string
	Required Requirements
}

var clientEntry = regexp.MustCompile(`^([a-z][a-z0-9]*)-entry$`)

func (stage *ClientStage) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil || fields == nil {
		return fmt.Errorf("client stage must be an object")
	}
	*stage = ClientStage{Entries: map[string]string{}}
	for key, value := range fields {
		if key == "required" {
			if err := decodeStrict(value, &stage.Required); err != nil {
				return fmt.Errorf("client required: %w", err)
			}
			continue
		}
		match := clientEntry.FindStringSubmatch(key)
		if match == nil {
			return fmt.Errorf("unknown client stage key %q; client entries are named <client>-entry", key)
		}
		var entry string
		if err := json.Unmarshal(value, &entry); err != nil {
			return fmt.Errorf("%s must be a path", key)
		}
		stage.Entries[match[1]] = entry
	}
	if len(stage.Entries) == 0 {
		return fmt.Errorf("client stage requires at least one <client>-entry")
	}
	return nil
}

type Author struct {
	Name    string              `json:"name"`
	Details []map[string]string `json:"details,omitempty"`
}

type Version struct {
	Major    int `json:"major"`
	Minor    int `json:"minor"`
	Revision int `json:"revision"`
}

type Channel struct {
	Manifest string `json:"manifest"`
	File     string `json:"file"`
}

type Stage struct {
	Entry    string       `json:"entry"`
	Required Requirements `json:"required"`
}

type Requirements struct {
	Modules    []string `json:"modules,omitempty"`
	Interfaces []string `json:"interfaces,omitempty"`
}

type Interface struct {
	Name     string            `json:"name"`
	File     string            `json:"file,omitempty"`
	Versions []int             `json:"versions,omitempty"`
	Entries  map[string]string `json:"-"`
	Required Requirements      `json:"-"`
}

func SplitVersion(id string) (string, int, bool) {
	base, text, found := strings.Cut(id, "@")
	if !found || base == "" {
		return id, 0, false
	}
	version, err := strconv.Atoi(text)
	if err != nil || version < 1 || strconv.Itoa(version) != text {
		return id, 0, false
	}
	return base, version, true
}

func Versioned(id string, version int) string { return id + "@" + strconv.Itoa(version) }

type Encryption struct {
	Enabled bool
	Public  string
}

func (encryption *Encryption) UnmarshalJSON(data []byte) error {
	if string(bytes.TrimSpace(data)) == "false" {
		*encryption = Encryption{}
		return nil
	}
	var settings struct {
		Public string `json:"public"`
	}
	if err := decodeStrict(data, &settings); err != nil {
		return fmt.Errorf("encrypt must be false or an object: %w", err)
	}
	*encryption = Encryption{Enabled: true, Public: settings.Public}
	return nil
}

func (declared *Interface) UnmarshalJSON(data []byte) error {
	var value Interface
	var name string
	if err := json.Unmarshal(data, &name); err == nil {
		value.Name = name
	} else {
		var fields map[string]json.RawMessage
		if err := decodeStrict(data, &fields); err != nil || fields == nil {
			return fmt.Errorf("interface must be name@version or an object with name, file, versions, and <client>-entry implementations")
		}
		for key, raw := range fields {
			var err error
			switch key {
			case "name":
				err = json.Unmarshal(raw, &value.Name)
			case "file":
				err = json.Unmarshal(raw, &value.File)
			case "versions":
				err = json.Unmarshal(raw, &value.Versions)
			case "required":
				err = decodeStrict(raw, &value.Required)
			default:
				match := clientEntry.FindStringSubmatch(key)
				if match == nil {
					return fmt.Errorf("unknown interface key %q; implementation entries are named <client>-entry", key)
				}
				var entry string
				if err = json.Unmarshal(raw, &entry); err == nil {
					if value.Entries == nil {
						value.Entries = map[string]string{}
					}
					value.Entries[match[1]] = entry
				}
			}
			if err != nil {
				return fmt.Errorf("interface %s: %w", key, err)
			}
		}
	}
	if strings.Contains(value.Name, "@") {
		base, version, ok := SplitVersion(value.Name)
		if !ok {
			return fmt.Errorf("interface %q has an invalid version", value.Name)
		}
		if len(value.Versions) > 0 {
			return fmt.Errorf("interface %q cannot use both @version and versions", value.Name)
		}
		value.Name, value.Versions = base, []int{version}
	}
	if len(value.Versions) == 0 {
		return fmt.Errorf("interface %q requires a version", value.Name)
	}
	seen := map[int]bool{}
	for _, version := range value.Versions {
		if version < 1 || seen[version] {
			return fmt.Errorf("interface %q has an invalid or duplicate version %d", value.Name, version)
		}
		seen[version] = true
	}
	*declared = value
	return nil
}

func (m Manifest) Namespace() string { return m.Owner + "." + m.Host }

func (m Manifest) ID() string { return m.Namespace() + "." + m.Name }

func (m Manifest) InterfaceID(name string) string { return m.Namespace() + "." + name }

type Package struct {
	Manifest     Manifest
	Files        fs.FS
	PrivateFiles []string
	Dependencies []Package
	Unsealed     bool
}

func (p Package) ID() string { return p.Manifest.ID() }

func Load(files fs.FS) (Package, error) {
	data, err := fs.ReadFile(files, FileName)
	if err != nil {
		return Package{}, fmt.Errorf("read %s: %w", FileName, err)
	}
	m, err := parseManifest(data, files)
	if err != nil {
		return Package{}, err
	}
	private := []string{FileName}
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(data, &fields)
	var serverFile string
	if json.Unmarshal(fields["server"], &serverFile) == nil && serverFile != "" {
		cleaned, err := CleanPath(serverFile)
		if err != nil {
			return Package{}, err
		}
		private = append(private, cleaned)
	}
	for _, raw := range m.Server.Data {
		var declaration struct {
			File string `json:".file"`
		}
		if json.Unmarshal(raw, &declaration) == nil && declaration.File != "" {
			cleaned, err := CleanPath(declaration.File)
			if err != nil {
				return Package{}, err
			}
			private = append(private, cleaned)
		}
	}
	return Package{Manifest: m, Files: files, PrivateFiles: private}, nil
}

func Parse(data []byte) (Manifest, error) { return parseManifest(data, nil) }

func parseManifest(data []byte, files fs.FS) (Manifest, error) {
	var top struct {
		Manifest
		Server json.RawMessage `json:"server"`
		Client json.RawMessage `json:"client"`
	}
	if err := decodeStrict(data, &top); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s: %w", FileName, err)
	}
	m := top.Manifest
	if err := side(top.Server, files, "server", &m.Server); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s for %s: %w", FileName, m.ID(), err)
	}
	if err := side(top.Client, files, "client", &m.Client); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s for %s: %w", FileName, m.ID(), err)
	}
	if err := m.Validate(); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s for %s: %w", FileName, m.ID(), err)
	}
	if files != nil {
		if err := m.checkClientFiles(files); err != nil {
			return Manifest{}, fmt.Errorf("invalid %s for %s: %w", FileName, m.ID(), err)
		}
	}
	return m, nil
}

func side(raw json.RawMessage, files fs.FS, name string, target any) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return nil
	}
	if trimmed[0] == '"' {
		var location string
		if err := json.Unmarshal(trimmed, &location); err != nil {
			return fmt.Errorf("%s must be a path or an object: %w", name, err)
		}
		file, err := CleanPath(location)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		if files == nil {
			return fmt.Errorf("%s file %s needs the package files", name, file)
		}
		contents, err := fs.ReadFile(files, file)
		if err != nil {
			return fmt.Errorf("read %s file: %w", name, err)
		}
		trimmed = contents
	}
	if err := decodeStrict(trimmed, target); err != nil {
		return fmt.Errorf("invalid %s: %w", name, err)
	}
	return nil
}

func (m *Manifest) Validate() error {
	switch m.Type {
	case TypeApplication, TypeModule, TypeKit:
	default:
		return fmt.Errorf("type must be application, module, or kit, not %q", m.Type)
	}
	if !ident.Segment(m.Owner) {
		return fmt.Errorf("owner %q must be a JavaScript identifier", m.Owner)
	}
	if !ident.Segment(m.Host) {
		return fmt.Errorf("host %q must be a JavaScript identifier", m.Host)
	}
	if !ident.Segment(m.Name) {
		return fmt.Errorf("name %q must be an identifier", m.Name)
	}
	if m.Encrypt.Enabled {
		public, err := CleanPath(m.Encrypt.Public)
		if err != nil {
			return fmt.Errorf("encrypt public key: %w", err)
		}
		m.Encrypt.Public = public
	}
	for name, channel := range m.Channels {
		if name == "" || channel.Manifest == "" || channel.File == "" {
			return fmt.Errorf("channel %q requires manifest and file", name)
		}
	}
	server, client := &m.Server, &m.Client
	for kind, dirs := range client.Assets {
		if !clientEntry.MatchString(kind + "-entry") {
			return fmt.Errorf("invalid client asset type %q", kind)
		}
		for i, dir := range dirs {
			cleaned, err := CleanPath(dir)
			if err != nil {
				return fmt.Errorf("client %s assets: %w", kind, err)
			}
			dirs[i] = cleaned
		}
	}
	interfaces := len(server.Interfaces) + len(server.Implements) + len(client.Interfaces) + len(client.Implements)
	switch m.Type {
	case TypeApplication:
		if server.Application == nil {
			return fmt.Errorf("an application requires a server application entry")
		}
	case TypeKit:
		if server.Application != nil || client.Application != nil {
			return fmt.Errorf("a kit cannot have an application entry")
		}
		if server.Library != nil || client.Library != nil {
			return fmt.Errorf("a kit cannot have a library entry; give each interface its own file")
		}
		if server.Security != nil || len(server.Data) > 0 {
			return fmt.Errorf("a kit cannot declare security or records; use a module")
		}
		if interfaces == 0 {
			return fmt.Errorf("a kit requires at least one interface")
		}
	}
	if server.Library == nil && server.Security == nil && server.Application == nil && client.Library == nil && client.Application == nil && interfaces == 0 {
		return fmt.Errorf("a package requires at least one entry or interface")
	}
	for name, stage := range map[string]*Stage{"library": server.Library, "security": server.Security, "application": server.Application} {
		if stage == nil {
			continue
		}
		entry, err := CleanPath(stage.Entry)
		if err != nil {
			return fmt.Errorf("server %s entry: %w", name, err)
		}
		stage.Entry = entry
		if err := checkRequirements("server "+name, stage.Required); err != nil {
			return err
		}
	}
	if server.Security != nil && len(server.Security.Required.Interfaces) > 0 {
		return fmt.Errorf("security cannot require interfaces")
	}
	for name, stage := range map[string]*ClientStage{"library": client.Library, "application": client.Application} {
		if stage == nil {
			continue
		}
		for kind, entry := range stage.Entries {
			cleaned, err := CleanPath(entry)
			if err != nil {
				return fmt.Errorf("client %s %s-entry: %w", name, kind, err)
			}
			stage.Entries[kind] = cleaned
		}
		if err := checkRequirements("client "+name, stage.Required); err != nil {
			return err
		}
	}
	for _, entry := range append(append([]Interface(nil), server.Interfaces...), server.Implements...) {
		if server.Library == nil && entry.File == "" {
			return fmt.Errorf("server interface %s must name a file when there is no server library", entry.Name)
		}
	}
	for _, entry := range append(append([]Interface(nil), server.Interfaces...), server.Implements...) {
		if len(entry.Entries) > 0 {
			return fmt.Errorf("server interface %s cannot have <client>-entry implementations", entry.Name)
		}
	}
	if err := m.checkInterfaces("server", server.Interfaces, server.Implements); err != nil {
		return err
	}
	if err := m.checkInterfaces("client", client.Interfaces, client.Implements); err != nil {
		return err
	}
	for _, entry := range append(append([]Interface(nil), client.Interfaces...), client.Implements...) {
		if entry.File == "" {
			return fmt.Errorf("client interface %s requires a JSON file", entry.Name)
		}
	}
	return nil
}

func checkRequirements(stage string, required Requirements) error {
	for _, id := range required.Modules {
		if !validQualified(id) {
			return fmt.Errorf("%s requirement %q must be owner.host.member", stage, id)
		}
	}
	for _, id := range required.Interfaces {
		if base, _, ok := SplitVersion(id); !ok || !validQualified(base) {
			return fmt.Errorf("%s interface requirement %q must be owner.host.member@version", stage, id)
		}
	}
	return nil
}

func (m *Manifest) checkInterfaces(sideName string, declared, implemented []Interface) error {
	declaredNames := map[string]bool{}
	provided := map[string]bool{}
	for _, list := range []struct {
		entries  []Interface
		declared bool
	}{{declared, true}, {implemented, false}} {
		for index, entry := range list.entries {
			id := entry.Name
			if list.declared {
				if !ident.Segment(entry.Name) {
					return fmt.Errorf("invalid %s interface name %q", sideName, entry.Name)
				}
				id = m.InterfaceID(entry.Name)
				declaredNames[id] = true
			} else {
				if !validQualified(entry.Name) {
					return fmt.Errorf("invalid implemented %s interface %q", sideName, entry.Name)
				}
				if declaredNames[id] {
					return fmt.Errorf("%s interface %s is declared by this package and cannot also be listed in implements", sideName, id)
				}
			}
			for _, version := range entry.Versions {
				key := Versioned(id, version)
				if provided[key] {
					return fmt.Errorf("%s interface %s is listed more than once", sideName, key)
				}
				provided[key] = true
			}
			if entry.File != "" {
				file, err := CleanPath(entry.File)
				if err != nil {
					return fmt.Errorf("%s interface %s file: %w", sideName, id, err)
				}
				list.entries[index].File = file
			}
			if err := checkRequirements(sideName+" interface "+id, entry.Required); err != nil {
				return err
			}
			for kind, entryFile := range entry.Entries {
				file, err := CleanPath(entryFile)
				if err != nil {
					return fmt.Errorf("%s interface %s %s-entry: %w", sideName, id, kind, err)
				}
				list.entries[index].Entries[kind] = file
			}
		}
	}
	return nil
}

func (m Manifest) checkClientFiles(files fs.FS) error {
	for _, entry := range append(append([]Interface(nil), m.Client.Interfaces...), m.Client.Implements...) {
		contents, err := fs.ReadFile(files, entry.File)
		if err != nil {
			return fmt.Errorf("client interface %s: %w", entry.Name, err)
		}
		if !json.Valid(contents) {
			return fmt.Errorf("client interface %s: %s is not valid JSON", entry.Name, entry.File)
		}
		if err := validateClientContract(contents); err != nil {
			return fmt.Errorf("client interface %s: %s: %w", entry.Name, entry.File, err)
		}
		for kind, file := range entry.Entries {
			info, err := fs.Stat(files, file)
			if err != nil {
				return fmt.Errorf("client interface %s %s-entry: %w", entry.Name, kind, err)
			}
			if info.IsDir() {
				return fmt.Errorf("client interface %s %s-entry %s is a directory", entry.Name, kind, file)
			}
		}
	}
	return nil
}

type Provided struct {
	ID       string
	Version  int
	File     string
	Original bool
	Entries  map[string]string
	Required Requirements
}

func (p Provided) Key() string { return Versioned(p.ID, p.Version) }

func provides(host string, declared, implemented []Interface) []Provided {
	provided := []Provided{}
	for _, entry := range declared {
		for _, version := range entry.Versions {
			provided = append(provided, Provided{ID: host + "." + entry.Name, Version: version, File: entry.File, Original: true, Entries: entry.Entries, Required: entry.Required})
		}
	}
	for _, entry := range implemented {
		for _, version := range entry.Versions {
			provided = append(provided, Provided{ID: entry.Name, Version: version, File: entry.File, Entries: entry.Entries, Required: entry.Required})
		}
	}
	return provided
}

func (m Manifest) Provides() []Provided {
	return provides(m.Namespace(), m.Server.Interfaces, m.Server.Implements)
}

func (m Manifest) ClientProvides() []Provided {
	return provides(m.Namespace(), m.Client.Interfaces, m.Client.Implements)
}

func validQualified(id string) bool {
	return ident.Qualified(id)
}

func CleanPath(file string) (string, error) {
	if file == "" {
		return "", fmt.Errorf("path is required")
	}
	if strings.HasPrefix(file, "/") || strings.Contains(file, "\\") {
		return "", fmt.Errorf("path %q must be relative and use forward slashes", file)
	}
	cleaned := path.Clean(strings.TrimPrefix(file, "./"))
	if !fs.ValidPath(cleaned) || cleaned == "." {
		return "", fmt.Errorf("path %q must stay inside the package", file)
	}
	return cleaned, nil
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

func (p Package) Hash() ([32]byte, error) {
	digest := sha256.New()
	err := fs.WalkDir(p.Files, ".", func(file string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		contents, err := fs.ReadFile(p.Files, file)
		if err != nil {
			return err
		}
		digest.Write([]byte(file))
		digest.Write([]byte{0})
		digest.Write(contents)
		digest.Write([]byte{0})
		return nil
	})
	if err != nil {
		return [32]byte{}, fmt.Errorf("hash package %s: %w", p.ID(), err)
	}
	var sum [32]byte
	copy(sum[:], digest.Sum(nil))
	return sum, nil
}

func (v Version) String() string {
	return strconv.Itoa(v.Major) + "." + strconv.Itoa(v.Minor) + "." + strconv.Itoa(v.Revision)
}
