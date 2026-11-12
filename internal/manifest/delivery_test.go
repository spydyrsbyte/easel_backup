package manifest

import (
	"io/fs"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
)

func TestPublicAssets(t *testing.T) {
	for _, test := range []struct {
		name, assets, entry string
		extra               fstest.MapFS
		bad                 bool
	}{
		{"public", "client/", "client/application.mjs", nil, false},
		{"server", "server/", "client/application.mjs", nil, true},
		{"traversal", "../", "client/application.mjs", nil, true},
		{"backslash", `client\\`, "client/application.mjs", nil, true},
		{"missing", "absent/", "client/application.mjs", nil, true},
		{"entry exposes server", "client/", "server/application.mjs", nil, true},
		{"symlink", "client/", "client/application.mjs", fstest.MapFS{"client/link": &fstest.MapFile{Mode: fs.ModeSymlink, Data: []byte("../server/application.mjs")}}, true},
		{"server schema", "schemas/", "client/application.mjs", nil, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			files := fstest.MapFS{
				"manifest.json":          {Data: []byte(`{"type":"application","owner":"easel","host":"test","name":"app","server":{"application":{"entry":"server/application.mjs"},"data":[{".file":"schemas/types.json"}]},"client":{"application":{"http-entry":"` + test.entry + `"},"assets":{"http":["` + test.assets + `"]}}}`)},
				"client/application.mjs": {Data: []byte(`import './shared.mjs';`)}, "client/shared.mjs": {Data: []byte("export const x=1;")},
				"server/application.mjs": {Data: []byte("secret")}, "schemas/types.json": {Data: []byte("[]")}, "undeclared.txt": {Data: []byte("private")},
			}
			for name, file := range test.extra {
				files[name] = file
			}
			pkg, err := Load(files)
			if err != nil {
				if test.bad {
					return
				}
				t.Fatal(err)
			}
			plan, err := Resolve([]Package{pkg})
			if test.bad {
				if err == nil {
					t.Fatal("accepted unsafe assets")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			d, err := plan.Delivery("http")
			if err != nil {
				t.Fatal(err)
			}
			if len(d.Resources) != 2 {
				t.Fatal(d.Resources)
			}
			for name, r := range d.Resources {
				if !strings.Contains(name, "/client/") || len(r.Hash) != 64 {
					t.Fatal(name, r)
				}
			}
		})
	}
}

func lazyPackages(t *testing.T, kit string, extra fstest.MapFS) ([]Package, error) {
	t.Helper()
	contract := []byte(`{"kind":"component","properties":{},"events":{},"slots":{}}`)
	kitFiles := fstest.MapFS{
		"manifest.json":      {Data: []byte(kit)},
		"interfaces/a.json":  {Data: contract},
		"interfaces/b.json":  {Data: contract},
		"client/a.mjs":       {Data: []byte("export default class A{}")},
		"client/library.mjs": {Data: []byte("export function initialize(){}")},
		"server/library.mjs": {Data: []byte("secret")},
	}
	for name, file := range extra {
		kitFiles[name] = file
	}
	appFiles := fstest.MapFS{
		"manifest.json":          {Data: []byte(`{"type":"application","owner":"easel","host":"app","name":"game","server":{"application":{"entry":"server/application.mjs"}},"client":{"application":{"http-entry":"client/application.mjs","android-entry":"client/application.kt","required":{"modules":["easel.tools.kit"],"interfaces":["easel.tools.a@1"]}}}}`)},
		"server/application.mjs": {Data: []byte("")}, "client/application.mjs": {Data: []byte("")}, "client/application.kt": {Data: []byte("")},
	}
	kitPackage, err := Load(kitFiles)
	if err != nil {
		return nil, err
	}
	appPackage, err := Load(appFiles)
	if err != nil {
		t.Fatal(err)
	}
	return []Package{appPackage, kitPackage}, nil
}

func TestLazyClientImplementations(t *testing.T) {
	kit := `{"type":"module","owner":"easel","host":"tools","name":"kit","client":{"library":{"http-entry":"client/library.mjs","android-entry":"client/library.kt","required":{"interfaces":["easel.tools.a@1"]}},"interfaces":[{"name":"a@1","file":"interfaces/a.json","http-entry":"./client/a.mjs"},{"name":"b@1","file":"interfaces/b.json"}]}}`
	pkgs, err := lazyPackages(t, kit, fstest.MapFS{"client/library.kt": {Data: []byte("")}})
	if err != nil {
		t.Fatal(err)
	}
	plan, err := Resolve(pkgs)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(plan.Clients, []string{"android", "http"}) {
		t.Fatalf("clients: %v", plan.Clients)
	}
	d, err := plan.Delivery("http")
	if err != nil {
		t.Fatal(err)
	}
	var out ClientPackage
	for _, p := range d.Packages {
		if p.ID == "easel.tools.kit" {
			out = p
		}
	}
	base := out.BaseURL
	want := []ClientInterface{{Name: "easel.tools.a@1", URL: base + "interfaces/a.json", Implementation: base + "client/a.mjs"}, {Name: "easel.tools.b@1", URL: base + "interfaces/b.json"}}
	if !reflect.DeepEqual(out.Interfaces, want) || !reflect.DeepEqual(out.Implements, []string{"easel.tools.b@1"}) || !reflect.DeepEqual(out.LibraryRequires, []string{"easel.tools.a@1"}) {
		t.Fatalf("http delivery: %+v", out)
	}
	if _, ok := d.Resources[base+"client/a.mjs"]; !ok {
		t.Fatal("lazy implementation is not served")
	}
	android, err := plan.Delivery("android")
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range android.Packages {
		if p.ID == "easel.tools.kit" && (p.Interfaces[0].Implementation != "" || !reflect.DeepEqual(p.Implements, []string{"easel.tools.a@1", "easel.tools.b@1"})) {
			t.Fatalf("android delivery: %+v", p)
		}
	}
}

func TestLazyOnlyPackageLimitsClients(t *testing.T) {
	kit := `{"type":"kit","owner":"easel","host":"tools","name":"kit","client":{"interfaces":[{"name":"a@1","file":"interfaces/a.json","http-entry":"client/a.mjs"}]}}`
	pkgs, err := lazyPackages(t, kit, nil)
	if err != nil {
		t.Fatal(err)
	}
	plan, err := Resolve(pkgs)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(plan.Clients, []string{"http"}) {
		t.Fatalf("clients: %v", plan.Clients)
	}
}

func TestLazyClientImplementationErrors(t *testing.T) {
	for name, test := range map[string]struct {
		kit, want string
	}{
		"server side":   {`{"type":"module","owner":"easel","host":"tools","name":"kit","server":{"library":{"entry":"server/library.mjs"},"interfaces":[{"name":"s@1","http-entry":"client/a.mjs"}]}}`, "cannot have <client>-entry"},
		"missing file":  {`{"type":"kit","owner":"easel","host":"tools","name":"kit","client":{"interfaces":[{"name":"a@1","file":"interfaces/a.json","http-entry":"client/missing.mjs"}]}}`, "http-entry"},
		"escapes":       {`{"type":"kit","owner":"easel","host":"tools","name":"kit","client":{"interfaces":[{"name":"a@1","file":"interfaces/a.json","http-entry":"../a.mjs"}]}}`, "inside the package"},
		"unknown key":   {`{"type":"kit","owner":"easel","host":"tools","name":"kit","client":{"interfaces":[{"name":"a@1","file":"interfaces/a.json","code":"client/a.mjs"}]}}`, "unknown interface key"},
		"not a path":    {`{"type":"kit","owner":"easel","host":"tools","name":"kit","client":{"interfaces":[{"name":"a@1","file":"interfaces/a.json","http-entry":3}]}}`, "http-entry"},
		"server source": {`{"type":"module","owner":"easel","host":"tools","name":"kit","server":{"library":{"entry":"server/library.mjs"},"interfaces":["s@1"]},"client":{"interfaces":[{"name":"a@1","file":"interfaces/a.json","http-entry":"server/library.mjs"}]}}`, "server-only"},
	} {
		t.Run(name, func(t *testing.T) {
			pkgs, err := lazyPackages(t, test.kit, nil)
			if err == nil {
				_, err = Resolve(pkgs)
			}
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

func TestMemberRequirements(t *testing.T) {
	member := func(required string) string {
		return `{"type":"kit","owner":"easel","host":"tools","name":"kit","client":{"interfaces":[{"name":"a@1","file":"interfaces/a.json","http-entry":"client/a.mjs","required":` + required + `},{"name":"b@1","file":"interfaces/b.json","http-entry":"client/a.mjs"}]}}`
	}
	pkgs, err := lazyPackages(t, member(`{"interfaces":["easel.tools.b@1"]}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	plan, err := Resolve(pkgs)
	if err != nil {
		t.Fatal(err)
	}
	d, err := plan.Delivery("http")
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range d.Packages {
		if p.ID == "easel.tools.kit" && !reflect.DeepEqual(p.Interfaces[0].Requires, []string{"easel.tools.b@1"}) {
			t.Fatalf("requires: %+v", p.Interfaces)
		}
	}
	for name, test := range map[string]struct{ required, want string }{
		"missing module":    {`{"modules":["easel.absent.thing"]}`, "requires module easel.absent.thing"},
		"missing interface": {`{"interfaces":["easel.absent.thing@1"]}`, "requires interface easel.absent.thing@1"},
		"bad name":          {`{"interfaces":["plain"]}`, "owner.host.member@version"},
		"unknown key":       {`{"extra":[]}`, "unknown field"},
	} {
		t.Run(name, func(t *testing.T) {
			pkgs, err := lazyPackages(t, member(test.required), nil)
			if err == nil {
				_, err = Resolve(pkgs)
			}
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}
