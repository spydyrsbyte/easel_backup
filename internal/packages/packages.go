package packages

import (
	"archive/zip"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"easel/internal/manifest"
	"easel/internal/platform"
	"easel/internal/seal"
)

const (
	Manual  = "manual"
	Startup = "startup"

	stagingFolder   = ".staging"
	previousFolder  = ".previous"
	defaultMaxBytes = 512 << 20
	maxEntries      = 50000
	fetchTimeout    = 2 * time.Minute
)

var ErrNotInstalled = errors.New("package is not installed")

type Preference struct {
	Channel string `json:"channel"`
	Update  string `json:"update"`
}

type Preferences struct {
	Default  Preference            `json:"default"`
	Packages map[string]Preference `json:"packages"`
}

func (p Preference) check() error {
	if p.Update != "" && p.Update != Manual && p.Update != Startup {
		return fmt.Errorf(`update must be "manual" or "startup", not %q`, p.Update)
	}
	return nil
}

func LoadPreferences(file string) (Preferences, error) {
	preferences := Preferences{Packages: map[string]Preference{}}
	data, err := os.ReadFile(file)
	if errors.Is(err, fs.ErrNotExist) {
		return preferences, nil
	}
	if err != nil {
		return Preferences{}, err
	}
	if err := json.Unmarshal(data, &preferences); err != nil {
		return Preferences{}, fmt.Errorf("invalid package preferences in %s: %w", file, err)
	}
	if preferences.Packages == nil {
		preferences.Packages = map[string]Preference{}
	}
	for id, preference := range preferences.Packages {
		if err := preference.check(); err != nil {
			return Preferences{}, fmt.Errorf("package preferences for %s: %w", id, err)
		}
	}
	return preferences, preferences.Default.check()
}

func (p Preferences) Save(file string) error {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	return os.WriteFile(file, append(data, '\n'), 0o644)
}

func (p Preferences) For(id string) Preference {
	chosen := p.Packages[id]
	if chosen.Channel == "" {
		chosen.Channel = p.Default.Channel
	}
	if chosen.Update == "" {
		chosen.Update = p.Default.Update
	}
	if chosen.Update == "" {
		chosen.Update = Manual
	}
	return chosen
}

type Installer struct {
	EaselDir       string
	Globals        []manifest.Package
	Compatible     func(context.Context, *platform.Catalog) error
	Client         *http.Client
	MaxBytes       int64
	AllowDowngrade bool
	Now            func() time.Time
}

type Inspection struct {
	ID        string   `json:"id"`
	Type      string   `json:"type"`
	Version   string   `json:"version"`
	Hash      string   `json:"hash"`
	Requires  []string `json:"requires"`
	Clients   []string `json:"clients"`
	Channels  []string `json:"channels"`
	Installed string   `json:"installed,omitempty"`
	Files     int      `json:"files"`
	Bytes     int64    `json:"bytes"`
}

type Result struct {
	Inspection
	Action   string `json:"action"`
	Folder   string `json:"folder"`
	Previous string `json:"previous,omitempty"`
}

func (i *Installer) limit() int64 {
	if i.MaxBytes > 0 {
		return i.MaxBytes
	}
	return defaultMaxBytes
}

func (i *Installer) now() time.Time {
	if i.Now != nil {
		return i.Now()
	}
	return time.Now()
}

func compare(a, b manifest.Version) int {
	for _, pair := range [][2]int{{a.Major, b.Major}, {a.Minor, b.Minor}, {a.Revision, b.Revision}} {
		if pair[0] != pair[1] {
			if pair[0] < pair[1] {
				return -1
			}
			return 1
		}
	}
	return 0
}

func (i *Installer) extract(archive string) (string, int, int64, error) {
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return "", 0, 0, fmt.Errorf("open package archive: %w", err)
	}
	defer reader.Close()
	if len(reader.File) > maxEntries {
		return "", 0, 0, fmt.Errorf("package archive has more than %d entries", maxEntries)
	}
	root := ""
	if _, err := reader.Open(manifest.FileName); err != nil {
		tops := map[string]bool{}
		for _, file := range reader.File {
			top, _, _ := strings.Cut(file.Name, "/")
			tops[top] = true
		}
		if len(tops) != 1 {
			return "", 0, 0, fmt.Errorf("package archive has no %s at its root", manifest.FileName)
		}
		for top := range tops {
			root = top + "/"
		}
		if _, err := reader.Open(root + manifest.FileName); err != nil {
			return "", 0, 0, fmt.Errorf("package archive has no %s at its root", manifest.FileName)
		}
	}
	if err := os.MkdirAll(filepath.Join(i.EaselDir, stagingFolder), 0o755); err != nil {
		return "", 0, 0, err
	}
	staging, err := os.MkdirTemp(filepath.Join(i.EaselDir, stagingFolder), "package-*")
	if err != nil {
		return "", 0, 0, err
	}
	files, total := 0, int64(0)
	fail := func(err error) (string, int, int64, error) {
		os.RemoveAll(staging)
		return "", 0, 0, err
	}
	for _, file := range reader.File {
		if !strings.HasPrefix(file.Name, root) {
			return fail(fmt.Errorf("package archive entry %q is outside the package folder", file.Name))
		}
		name := strings.TrimPrefix(file.Name, root)
		if name == "" || strings.HasSuffix(name, "/") {
			continue
		}
		if path.Clean("/" + name)[1:] != name || strings.ContainsAny(name, `\:`) {
			return fail(fmt.Errorf("package archive entry %q has an unsafe path", file.Name))
		}
		if !file.Mode().IsRegular() {
			return fail(fmt.Errorf("package archive entry %q is not a regular file", file.Name))
		}
		target := filepath.Join(staging, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fail(err)
		}
		source, err := file.Open()
		if err != nil {
			return fail(err)
		}
		output, err := os.Create(target)
		if err == nil {
			var written int64
			written, err = io.Copy(output, io.LimitReader(source, i.limit()-total+1))
			total += written
			if closeErr := output.Close(); err == nil {
				err = closeErr
			}
		}
		source.Close()
		if err != nil {
			return fail(fmt.Errorf("unpack %s: %w", name, err))
		}
		if total > i.limit() {
			return fail(fmt.Errorf("package is larger than %d bytes when unpacked", i.limit()))
		}
		files++
	}
	return staging, files, total, nil
}

func (i *Installer) folderOf(id string) (string, manifest.Package, error) {
	for _, group := range []string{"applications", "modules"} {
		entries, err := os.ReadDir(filepath.Join(i.EaselDir, group))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return "", manifest.Package{}, err
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			folder := filepath.Join(i.EaselDir, group, entry.Name())
			pkg, err := seal.Load(os.DirFS(folder))
			if err == nil && pkg.ID() == id {
				return folder, pkg, nil
			}
		}
	}
	return "", manifest.Package{}, ErrNotInstalled
}

func group(pkg manifest.Package) string {
	if pkg.Manifest.Type == manifest.TypeApplication {
		return "applications"
	}
	return "modules"
}

func (i *Installer) validate(ctx context.Context, staged manifest.Package, removing string) (*platform.Catalog, []string, error) {
	installed, err := platform.LoadCatalog(i.EaselDir)
	if err != nil {
		return nil, nil, fmt.Errorf("the installed packages do not load: %w", err)
	}
	catalog := installed.Copy()
	clients := []string{}
	if removing != "" {
		if dependents := catalog.Dependents(removing); len(dependents) > 0 {
			return nil, nil, fmt.Errorf("%s is required by %s", removing, strings.Join(dependents, ", "))
		}
		delete(catalog.Modules, removing)
	} else {
		id := staged.ID()
		if staged.Manifest.Type == manifest.TypeApplication {
			if _, module := catalog.Modules[id]; module {
				return nil, nil, fmt.Errorf("%s is installed as a module and cannot become an application", id)
			}
			catalog.Applications[id] = staged
		} else {
			if _, application := catalog.Applications[id]; application {
				return nil, nil, fmt.Errorf("%s is installed as an application and cannot become a %s", id, staged.Manifest.Type)
			}
			catalog.Modules[id] = staged
		}
		if missing := catalog.Missing(staged); len(missing) > 0 {
			return nil, nil, fmt.Errorf("%s requires packages that are not installed: %s", id, strings.Join(missing, ", "))
		}
		if _, err := staged.Hash(); err != nil {
			return nil, nil, fmt.Errorf("read the files of %s: %w", id, err)
		}
		seen := map[string]bool{}
		for application := range catalog.Applications {
			packages, err := catalog.Packages(application, nil)
			if err != nil {
				if application == id {
					return nil, nil, err
				}
				continue
			}
			uses := false
			for _, pkg := range packages {
				uses = uses || pkg.ID() == id
			}
			if !uses {
				continue
			}
			plan, err := platform.Plan(packages, i.Globals)
			if err != nil {
				return nil, nil, fmt.Errorf("%s does not load with %s: %w", application, id, err)
			}
			for _, kind := range plan.Clients {
				if _, err := plan.Delivery(kind); err != nil {
					return nil, nil, fmt.Errorf("%s cannot be delivered to %s clients with %s: %w", application, kind, id, err)
				}
				if application == id && !seen[kind] {
					seen[kind] = true
					clients = append(clients, kind)
				}
			}
		}
	}
	if i.Compatible != nil {
		if err := i.Compatible(ctx, catalog); err != nil {
			return nil, nil, err
		}
	}
	sort.Strings(clients)
	return catalog, clients, nil
}

func describe(pkg manifest.Package, catalog *platform.Catalog, clients []string, files int, size int64) Inspection {
	hash, _ := pkg.Hash()
	channels := []string{}
	for name := range pkg.Manifest.Channels {
		channels = append(channels, name)
	}
	sort.Strings(channels)
	requires := []string{}
	if catalog != nil {
		requires = catalog.Requires(pkg)
	}
	if clients == nil {
		clients = []string{}
	}
	return Inspection{ID: pkg.ID(), Type: pkg.Manifest.Type, Version: pkg.Manifest.Version.String(), Hash: hex.EncodeToString(hash[:]), Requires: requires, Clients: clients, Channels: channels, Files: files, Bytes: size}
}

func (i *Installer) stage(ctx context.Context, archive string) (string, manifest.Package, Inspection, error) {
	staging, files, size, err := i.extract(archive)
	if err != nil {
		return "", manifest.Package{}, Inspection{}, err
	}
	pkg, err := seal.Load(os.DirFS(staging))
	if err != nil {
		os.RemoveAll(staging)
		return "", manifest.Package{}, Inspection{}, fmt.Errorf("invalid package: %w", err)
	}
	_, current, err := i.folderOf(pkg.ID())
	if err != nil && !errors.Is(err, ErrNotInstalled) {
		os.RemoveAll(staging)
		return "", manifest.Package{}, Inspection{}, err
	}
	if err == nil && compare(pkg.Manifest.Version, current.Manifest.Version) < 0 && !i.AllowDowngrade {
		os.RemoveAll(staging)
		return "", manifest.Package{}, Inspection{}, fmt.Errorf("%s %s is older than the installed %s", pkg.ID(), pkg.Manifest.Version, current.Manifest.Version)
	}
	catalog, clients, validation := i.validate(ctx, pkg, "")
	if validation != nil {
		os.RemoveAll(staging)
		return "", manifest.Package{}, Inspection{}, validation
	}
	inspection := describe(pkg, catalog, clients, files, size)
	if err == nil {
		inspection.Installed = current.Manifest.Version.String()
	}
	return staging, pkg, inspection, nil
}

func (i *Installer) Inspect(ctx context.Context, archive string) (Inspection, error) {
	staging, _, inspection, err := i.stage(ctx, archive)
	if err != nil {
		return Inspection{}, err
	}
	os.RemoveAll(staging)
	return inspection, nil
}

func (i *Installer) retire(folder string, pkg manifest.Package) (string, error) {
	kept := filepath.Join(i.EaselDir, previousFolder, pkg.ID(), fmt.Sprintf("%s-%d", pkg.Manifest.Version, i.now().UnixNano()))
	if err := os.MkdirAll(filepath.Dir(kept), 0o755); err != nil {
		return "", err
	}
	if err := os.Rename(folder, kept); err != nil {
		return "", fmt.Errorf("set aside the installed %s: %w", pkg.ID(), err)
	}
	return kept, nil
}

func (i *Installer) activate(staging string, pkg manifest.Package) (string, string, string, error) {
	target, current, err := i.folderOf(pkg.ID())
	action, previous := "installed", ""
	switch {
	case errors.Is(err, ErrNotInstalled):
		target = filepath.Join(i.EaselDir, group(pkg), pkg.ID())
		if _, err := os.Stat(target); err == nil {
			return "", "", "", fmt.Errorf("folder %s is in use by another package", target)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return "", "", "", err
		}
	case err != nil:
		return "", "", "", err
	default:
		switch order := compare(pkg.Manifest.Version, current.Manifest.Version); {
		case order > 0:
			action = "updated"
		case order < 0:
			action = "downgraded"
		default:
			action = "reinstalled"
		}
		if previous, err = i.retire(target, current); err != nil {
			return "", "", "", err
		}
	}
	if err := os.Rename(staging, target); err != nil {
		if previous != "" {
			if restore := os.Rename(previous, target); restore != nil {
				return "", "", "", fmt.Errorf("activate %s: %w; the previous installation is kept in %s", pkg.ID(), err, previous)
			}
		}
		return "", "", "", fmt.Errorf("activate %s: %w", pkg.ID(), err)
	}
	return action, target, previous, nil
}

func (i *Installer) Install(ctx context.Context, archive string) (Result, error) {
	staging, pkg, inspection, err := i.stage(ctx, archive)
	if err != nil {
		return Result{}, err
	}
	action, folder, previous, err := i.activate(staging, pkg)
	if err != nil {
		os.RemoveAll(staging)
		return Result{}, err
	}
	return Result{Inspection: inspection, Action: action, Folder: folder, Previous: previous}, nil
}

func (i *Installer) Remove(ctx context.Context, id string) (Result, error) {
	folder, pkg, err := i.folderOf(id)
	if err != nil {
		return Result{}, fmt.Errorf("%s: %w", id, err)
	}
	if pkg.Manifest.Type == manifest.TypeApplication {
		return Result{}, fmt.Errorf("%s is an application; delete or export its games and remove its folder by hand", id)
	}
	catalog, _, err := i.validate(ctx, manifest.Package{}, id)
	if err != nil {
		return Result{}, err
	}
	inspection := describe(pkg, catalog, nil, 0, 0)
	inspection.Installed = pkg.Manifest.Version.String()
	previous, err := i.retire(folder, pkg)
	if err != nil {
		return Result{}, err
	}
	return Result{Inspection: inspection, Action: "removed", Folder: folder, Previous: previous}, nil
}

func (i *Installer) Kept(id string) []string {
	entries, err := os.ReadDir(filepath.Join(i.EaselDir, previousFolder, id))
	if err != nil {
		return []string{}
	}
	type kept struct {
		name  string
		stamp string
	}
	found := []kept{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		index := strings.LastIndex(entry.Name(), "-")
		if index < 0 {
			continue
		}
		found = append(found, kept{entry.Name(), fmt.Sprintf("%030s", entry.Name()[index+1:])})
	}
	sort.Slice(found, func(a, b int) bool { return found[a].stamp > found[b].stamp })
	names := make([]string, len(found))
	for index, entry := range found {
		names[index] = entry.name
	}
	return names
}

func (i *Installer) Rollback(ctx context.Context, id string) (Result, error) {
	kept := i.Kept(id)
	if len(kept) == 0 {
		return Result{}, fmt.Errorf("no previous installation of %s is kept", id)
	}
	source := filepath.Join(i.EaselDir, previousFolder, id, kept[0])
	pkg, err := seal.Load(os.DirFS(source))
	if err != nil {
		return Result{}, fmt.Errorf("the kept installation of %s does not load: %w", id, err)
	}
	if pkg.ID() != id {
		return Result{}, fmt.Errorf("the kept installation in %s is %s, not %s", source, pkg.ID(), id)
	}
	catalog, clients, err := i.validate(ctx, pkg, "")
	if err != nil {
		return Result{}, err
	}
	inspection := describe(pkg, catalog, clients, 0, 0)
	if _, current, err := i.folderOf(id); err == nil {
		inspection.Installed = current.Manifest.Version.String()
	}
	_, folder, previous, err := i.activate(source, pkg)
	if err != nil {
		return Result{}, err
	}
	return Result{Inspection: inspection, Action: "rolled back", Folder: folder, Previous: previous}, nil
}

type Installed struct {
	Inspection
	Folder     string     `json:"folder"`
	Preference Preference `json:"preference"`
	Kept       []string   `json:"kept"`
	Problem    string     `json:"problem,omitempty"`
}

func (i *Installer) List(preferences Preferences) ([]Installed, error) {
	catalog, catalogErr := platform.LoadCatalog(i.EaselDir)
	listed := []Installed{}
	for _, name := range []string{"applications", "modules"} {
		entries, err := os.ReadDir(filepath.Join(i.EaselDir, name))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			folder := filepath.Join(i.EaselDir, name, entry.Name())
			pkg, err := seal.Load(os.DirFS(folder))
			if err != nil {
				listed = append(listed, Installed{Inspection: Inspection{ID: entry.Name(), Requires: []string{}, Clients: []string{}, Channels: []string{}}, Folder: folder, Kept: []string{}, Problem: err.Error()})
				continue
			}
			clients := []string{}
			problem := ""
			if catalogErr != nil {
				problem = catalogErr.Error()
			} else if missing := catalog.Missing(pkg); len(missing) > 0 {
				problem = "requires packages that are not installed: " + strings.Join(missing, ", ")
			} else if pkg.Manifest.Type == manifest.TypeApplication {
				if packages, err := catalog.Packages(pkg.ID(), nil); err != nil {
					problem = err.Error()
				} else if plan, err := platform.Plan(packages, i.Globals); err != nil {
					problem = err.Error()
				} else {
					clients = append(clients, plan.Clients...)
				}
			}
			described := describe(pkg, catalog, clients, 0, 0)
			described.Installed = described.Version
			listed = append(listed, Installed{Inspection: described, Folder: folder, Preference: preferences.For(pkg.ID()), Kept: i.Kept(pkg.ID()), Problem: problem})
		}
	}
	sort.Slice(listed, func(a, b int) bool { return listed[a].ID < listed[b].ID })
	return listed, nil
}

type Update struct {
	ID        string `json:"id"`
	Installed string `json:"installed"`
	Available string `json:"available,omitempty"`
	Channel   string `json:"channel"`
	Mode      string `json:"mode"`
	File      string `json:"file,omitempty"`
	Newer     bool   `json:"newer"`
	Problem   string `json:"problem,omitempty"`
}

func (i *Installer) locate(folder, reference string) (string, bool) {
	parsed, err := url.Parse(reference)
	if err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") {
		return reference, true
	}
	if err == nil && parsed.Scheme == "file" {
		return filepath.FromSlash(strings.TrimPrefix(parsed.Path, "/")), false
	}
	if filepath.IsAbs(reference) {
		return reference, false
	}
	return filepath.Join(folder, filepath.FromSlash(reference)), false
}

func (i *Installer) fetch(ctx context.Context, folder, reference string, limit int64) (io.ReadCloser, error) {
	location, remote := i.locate(folder, reference)
	if !remote {
		return os.Open(location)
	}
	client := i.Client
	if client == nil {
		client = &http.Client{Timeout: fetchTimeout}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, location, nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, fmt.Errorf("%s answered %s", location, response.Status)
	}
	return struct {
		io.Reader
		io.Closer
	}{io.LimitReader(response.Body, limit), response.Body}, nil
}

func (i *Installer) Check(ctx context.Context, preferences Preferences) ([]Update, error) {
	found := []Update{}
	for _, name := range []string{"applications", "modules"} {
		entries, err := os.ReadDir(filepath.Join(i.EaselDir, name))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			folder := filepath.Join(i.EaselDir, name, entry.Name())
			pkg, err := seal.Load(os.DirFS(folder))
			if !entry.IsDir() || err != nil || len(pkg.Manifest.Channels) == 0 {
				continue
			}
			preference := preferences.For(pkg.ID())
			update := Update{ID: pkg.ID(), Installed: pkg.Manifest.Version.String(), Channel: preference.Channel, Mode: preference.Update}
			channel, offered := pkg.Manifest.Channels[preference.Channel]
			switch {
			case preference.Channel == "":
				update.Problem = "no update channel is chosen"
			case !offered:
				update.Problem = "the package does not offer channel " + preference.Channel
			default:
				update.File = channel.File
				source, err := i.fetch(ctx, folder, channel.Manifest, 1<<20)
				if err != nil {
					update.Problem = "read channel manifest: " + err.Error()
					break
				}
				data, err := io.ReadAll(source)
				source.Close()
				if err != nil {
					update.Problem = "read channel manifest: " + err.Error()
					break
				}
				var published struct {
					Owner   string           `json:"owner"`
					Host    string           `json:"host"`
					Name    string           `json:"name"`
					Version manifest.Version `json:"version"`
				}
				if err := json.Unmarshal(data, &published); err != nil {
					update.Problem = "invalid channel manifest: " + err.Error()
					break
				}
				if id := published.Owner + "." + published.Host + "." + published.Name; id != pkg.ID() {
					update.Problem = "the channel publishes " + id
					break
				}
				update.Available = published.Version.String()
				update.Newer = compare(published.Version, pkg.Manifest.Version) > 0
			}
			found = append(found, update)
		}
	}
	sort.Slice(found, func(a, b int) bool { return found[a].ID < found[b].ID })
	return found, nil
}

func (i *Installer) Apply(ctx context.Context, update Update) (Result, error) {
	if update.File == "" {
		return Result{}, fmt.Errorf("%s has no update to download", update.ID)
	}
	folder, _, err := i.folderOf(update.ID)
	if err != nil {
		return Result{}, fmt.Errorf("%s: %w", update.ID, err)
	}
	source, err := i.fetch(ctx, folder, update.File, i.limit()+1)
	if err != nil {
		return Result{}, fmt.Errorf("download %s: %w", update.ID, err)
	}
	defer source.Close()
	if err := os.MkdirAll(filepath.Join(i.EaselDir, stagingFolder), 0o755); err != nil {
		return Result{}, err
	}
	download, err := os.CreateTemp(filepath.Join(i.EaselDir, stagingFolder), "download-*.zip")
	if err != nil {
		return Result{}, err
	}
	defer os.Remove(download.Name())
	written, err := io.Copy(download, source)
	if closeErr := download.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return Result{}, fmt.Errorf("download %s: %w", update.ID, err)
	}
	if written > i.limit() {
		return Result{}, fmt.Errorf("the download of %s is larger than %d bytes", update.ID, i.limit())
	}
	staging, pkg, inspection, err := i.stage(ctx, download.Name())
	if err != nil {
		return Result{}, err
	}
	if pkg.ID() != update.ID {
		os.RemoveAll(staging)
		return Result{}, fmt.Errorf("the download for %s contains %s", update.ID, pkg.ID())
	}
	action, target, previous, err := i.activate(staging, pkg)
	if err != nil {
		os.RemoveAll(staging)
		return Result{}, err
	}
	return Result{Inspection: inspection, Action: action, Folder: target, Previous: previous}, nil
}

type Outcome struct {
	Update
	Result *Result `json:"result,omitempty"`
}

func (i *Installer) Startup(ctx context.Context, preferences Preferences) []Outcome {
	outcomes := []Outcome{}
	updates, err := i.Check(ctx, preferences)
	if err != nil {
		return []Outcome{{Update: Update{Problem: err.Error()}}}
	}
	for _, update := range updates {
		if update.Mode != Startup || (!update.Newer && update.Problem == "") {
			continue
		}
		outcome := Outcome{Update: update}
		if update.Problem == "" {
			result, err := i.Apply(ctx, update)
			if err != nil {
				outcome.Problem = err.Error()
			} else {
				outcome.Result = &result
			}
		}
		outcomes = append(outcomes, outcome)
	}
	return outcomes
}

func Pack(folder, archive string) error {
	if _, err := manifest.Load(os.DirFS(folder)); err != nil {
		return fmt.Errorf("invalid package: %w", err)
	}
	output, err := os.Create(archive)
	if err != nil {
		return err
	}
	writer := zip.NewWriter(output)
	err = filepath.WalkDir(folder, func(current string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		relative, err := filepath.Rel(folder, current)
		if err != nil {
			return err
		}
		target, err := writer.Create(filepath.ToSlash(relative))
		if err != nil {
			return err
		}
		source, err := os.Open(current)
		if err != nil {
			return err
		}
		defer source.Close()
		_, err = io.Copy(target, source)
		return err
	})
	if closeErr := writer.Close(); err == nil {
		err = closeErr
	}
	if closeErr := output.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(archive)
	}
	return err
}
