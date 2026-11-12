package manifest

import (
	"reflect"
	"strings"
	"testing"
	"testing/fstest"
)

func parse(t *testing.T, data string) Manifest {
	t.Helper()
	m, err := Parse([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestParseSample(t *testing.T) {
	m := parse(t, `{
		"type":"application","name":"game","owner":"easel","host":"acme",
		"authors":[{"name":"Ada","details":[{"email":"ada@example.com"}]}],
		"version":{"major":4,"minor":22,"revision":321},
		"encrypt":false,
		"channels":{"stable":{"manifest":"https://example.com/m.json","file":"https://example.com/f.zip"},"beta-2":{"manifest":"https://example.com/b.json","file":"https://example.com/b.zip"}},
		"server":{"library":{"entry":"./library/main.mjs","required":{"modules":["easel.acme.tools"],"interfaces":["easel.acme.dice@1"]}},
		"security":{"entry":"./security/main.mjs","required":{"modules":["easel.acme.tools"]}},
		"application":{"entry":"./startup.mjs","required":{"interfaces":["easel.acme.dice@1"]}},
		"interfaces":["board@1",{"name":"cards","file":"./library/interfaces/cards.mjs","versions":[1,2]}]
	}}`)
	if m.ID() != "easel.acme.game" || m.Server.Library.Entry != "library/main.mjs" || m.Server.Application.Entry != "startup.mjs" {
		t.Fatalf("parsed: %+v", m)
	}
	if len(m.Channels) != 2 || m.Encrypt.Enabled || m.Version.Revision != 321 {
		t.Fatalf("metadata: %+v", m)
	}
	if !reflect.DeepEqual(m.Server.Interfaces, []Interface{{Name: "board", Versions: []int{1}}, {Name: "cards", File: "library/interfaces/cards.mjs", Versions: []int{1, 2}}}) {
		t.Fatalf("interfaces: %+v", m.Server.Interfaces)
	}
	encrypted := parse(t, `{"type":"module","name":"dice","owner":"easel","host":"acme","encrypt":{"public":"./keys/key.txt"},"server":{"library":{"entry":"dice.mjs"},"interfaces":["dice@1"]}}`)
	if !encrypted.Encrypt.Enabled || encrypted.Encrypt.Public != "keys/key.txt" {
		t.Fatalf("encrypt: %+v", encrypted.Encrypt)
	}
	if absent := parse(t, `{"type":"module","name":"m","owner":"easel","host":"acme","server":{"security":{"entry":"s.mjs"}}}`); absent.Encrypt.Enabled {
		t.Fatal("absent encrypt enabled")
	}
}

func TestParseRejects(t *testing.T) {
	for name, test := range map[string]struct {
		data string
		want string
	}{
		"type":                {`{"type":"application|module|kit","name":"a","owner":"easel","host":"h","server":{"application":{"entry":"a.mjs"}}}`, "type must be"},
		"unknown field":       {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"extra":1}}`, "unknown field"},
		"kit application":     {`{"type":"kit","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"application":{"entry":"b.mjs"},"interfaces":["i@1"]}}`, "kit cannot"},
		"kit interfaces":      {`{"type":"kit","name":"a","owner":"easel","host":"h"}`, "kit requires"},
		"kit library":         {`{"type":"kit","name":"a","owner":"easel","host":"h","client":{"library":{"http-entry":"a.mjs"},"interfaces":[{"name":"x@1","file":"x.json"}]}}`, "kit cannot have a library"},
		"kit security":        {`{"type":"kit","name":"a","owner":"easel","host":"h","server":{"security":{"entry":"s.mjs"},"interfaces":[{"name":"i@1","file":"i.mjs"}]}}`, "kit cannot declare security"},
		"kit records":         {`{"type":"kit","name":"a","owner":"easel","host":"h","server":{"interfaces":[{"name":"i@1","file":"i.mjs"}],"data":[{".name":"Thing"}]}}`, "kit cannot declare security or records"},
		"file-only module":    {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"security":{"entry":"a.mjs"},"interfaces":[{"name":"i@1","file":"i.mjs"},"j@1"]}}`, "server interface j must name a file"},
		"application entry":   {`{"type":"application","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"}}}`, "requires a server application entry"},
		"no stages":           {`{"type":"module","name":"a","owner":"easel","host":"h"}`, "at least one"},
		"escape":              {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"../a.mjs"}}}`, "inside the package"},
		"absolute":            {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"/a.mjs"}}}`, "relative"},
		"requirement":         {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs","required":{"modules":["plain"]}}}}`, "owner.host.member"},
		"security interfaces": {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"security":{"entry":"a.mjs","required":{"interfaces":["easel.h.i@1"]}}}}`, "cannot require interfaces"},
		"orphan interfaces":   {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"security":{"entry":"a.mjs"},"interfaces":["i@1"]}}`, "must name a file when there is no server library"},
		"duplicate interface": {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"interfaces":["i@1",{"name":"i","versions":[2,1]}]}}`, "listed more than once"},
		"encrypt true":        {`{"type":"module","name":"a","owner":"easel","host":"h","encrypt":true,"server":{"library":{"entry":"a.mjs"}}}`, "encrypt must be"},
		"encrypt key":         {`{"type":"module","name":"a","owner":"easel","host":"h","encrypt":{},"server":{"library":{"entry":"a.mjs"}}}`, "encrypt public key"},
		"missing version":     {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"interfaces":["i"]}}`, "requires a version"},
		"both versions":       {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"interfaces":[{"name":"i@1","versions":[2]}]}}`, "both @version and versions"},
		"zero version":        {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"interfaces":["i@0"]}}`, "invalid version"},
		"unversioned require": {`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs","required":{"interfaces":["easel.h.i"]}}}}`, "owner.host.member@version"},
		"channel":             {`{"type":"module","name":"a","owner":"easel","host":"h","channels":{"x":{"manifest":"m"}},"server":{"library":{"entry":"a.mjs"}}}`, "channel \"x\" requires manifest and file"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Parse([]byte(test.data)); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

func TestLoadReadsManifest(t *testing.T) {
	files := fstest.MapFS{FileName: {Data: []byte(`{"type":"module","name":"m","owner":"easel","host":"h","server":{"library":{"entry":"m.mjs"}}}`)}}
	p, err := Load(files)
	if err != nil || p.ID() != "easel.h.m" {
		t.Fatalf("load: %+v %v", p, err)
	}
	if _, err := Load(fstest.MapFS{}); err == nil {
		t.Fatal("missing manifest accepted")
	}
}

func packages(t *testing.T, manifests ...string) []Package {
	t.Helper()
	out := []Package{}
	for _, data := range manifests {
		out = append(out, Package{Manifest: parse(t, data)})
	}
	return out
}

func ids(entries []Entry) []string {
	out := []string{}
	for _, entry := range entries {
		out = append(out, entry.Package.ID())
	}
	return out
}

func TestResolveOrdersStages(t *testing.T) {
	plan, err := Resolve(packages(t,
		`{"type":"module","name":"late","owner":"easel","host":"h","server":{"library":{"entry":"l.mjs"},"application":{"entry":"a.mjs"}}}`,
		`{"type":"module","name":"base","owner":"easel","host":"h","server":{"library":{"entry":"b.mjs"},"security":{"entry":"s.mjs"}}}`,
		`{"type":"module","name":"dice","owner":"easel","host":"h","server":{"library":{"entry":"d.mjs","required":{"modules":["easel.h.base"]}},"interfaces":["dice@1"]}}`,
		`{"type":"application","name":"game","owner":"easel","host":"h","server":{"security":{"entry":"s.mjs","required":{"modules":["easel.h.base"]}},"library":{"entry":"g.mjs","required":{"interfaces":["easel.h.dice@1"]}},"application":{"entry":"main.mjs","required":{"modules":["easel.h.base"],"interfaces":["easel.h.dice@1"]}}}}`,
	))
	if err != nil {
		t.Fatal(err)
	}
	for name, test := range map[string]struct {
		got  []string
		want string
	}{
		"security":    {ids(plan.Security), "easel.h.base easel.h.game"},
		"library":     {ids(plan.Library), "easel.h.base easel.h.dice easel.h.game easel.h.late"},
		"application": {ids(plan.Startup), "easel.h.game easel.h.late"},
	} {
		if got := strings.Join(test.got, " "); got != test.want {
			t.Errorf("%s order: %s, want %s", name, got, test.want)
		}
	}
	if plan.Application.ID() != "easel.h.game" {
		t.Fatalf("plan: %+v", plan)
	}
}

func TestResolveRejects(t *testing.T) {
	game := `{"type":"application","name":"game","owner":"easel","host":"h","server":{"application":{"entry":"main.mjs"}}}`
	for name, test := range map[string]struct {
		manifests []string
		want      string
	}{
		"no application":    {[]string{`{"type":"module","name":"m","owner":"easel","host":"h","server":{"library":{"entry":"m.mjs"}}}`}, "exactly one application"},
		"two applications":  {[]string{game, `{"type":"application","name":"other","owner":"easel","host":"h","server":{"application":{"entry":"main.mjs"}}}`}, "both applications"},
		"duplicate":         {[]string{game, game}, "duplicate package"},
		"missing module":    {[]string{`{"type":"application","name":"game","owner":"easel","host":"h","server":{"application":{"entry":"main.mjs","required":{"modules":["easel.h.missing"]}}}}`}, "not installed"},
		"missing interface": {[]string{`{"type":"application","name":"game","owner":"easel","host":"h","server":{"application":{"entry":"main.mjs","required":{"interfaces":["easel.h.missing@1"]}}}}`}, "no package declares"},
		"shared interface": {[]string{game,
			`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"interfaces":["dice@1"]}}`,
			`{"type":"module","name":"b","owner":"easel","host":"h","server":{"library":{"entry":"b.mjs"},"interfaces":["dice@1"]}}`}, "declared by both"},
		"undeclared implementation": {[]string{game,
			`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"implements":["easel.other.dice@1"]}}`}, "no package declares"},
		"cycle": {[]string{game,
			`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs","required":{"modules":["easel.h.b"]}}}}`,
			`{"type":"module","name":"b","owner":"easel","host":"h","server":{"library":{"entry":"b.mjs","required":{"modules":["easel.h.a"]}}}}`}, "cycle"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Resolve(packages(t, test.manifests...)); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

func TestImplementsOrdersAfterDeclaration(t *testing.T) {
	m := parse(t, `{"type":"module","name":"fancy","owner":"easel","host":"other","server":{"library":{"entry":"f.mjs"},"implements":["easel.h.dice@1",{"name":"easel.h.cards@2","file":"./cards.mjs"}]}}`)
	provided := m.Provides()
	if !reflect.DeepEqual(provided, []Provided{{ID: "easel.h.dice", Version: 1}, {ID: "easel.h.cards", Version: 2, File: "cards.mjs"}}) {
		t.Fatalf("provides: %+v", provided)
	}
	if _, err := Parse([]byte(`{"type":"module","name":"a","owner":"easel","host":"h","server":{"library":{"entry":"a.mjs"},"interfaces":["dice@1"],"implements":["easel.h.dice@1"]}}`)); err == nil || !strings.Contains(err.Error(), "cannot also be listed") {
		t.Fatalf("self implementation: %v", err)
	}
	plan, err := Resolve(packages(t,
		`{"type":"application","name":"game","owner":"easel","host":"h","server":{"library":{"entry":"g.mjs","required":{"interfaces":["easel.h.dice@1"]}},"application":{"entry":"main.mjs"}}}`,
		`{"type":"module","name":"fancy","owner":"easel","host":"other","server":{"library":{"entry":"f.mjs"},"implements":["easel.h.dice@1"]}}`,
		`{"type":"module","name":"dice","owner":"easel","host":"h","server":{"library":{"entry":"d.mjs"},"interfaces":["dice@1"]}}`,
	))
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(ids(plan.Library), " "); got != "easel.h.dice easel.other.fancy easel.h.game" {
		t.Fatalf("library order: %s", got)
	}
}

func TestSidesFromFilesOrInline(t *testing.T) {
	files := fstest.MapFS{
		FileName:      {Data: []byte(`{"type":"module","name":"m","owner":"easel","host":"h","server":"./server.json","client":{"library":{"http-entry":"./web/index.mjs","android-entry":"./android/Index.kt"},"interfaces":[{"name":"sheet@1","file":"./sheet.json"}]}}`)},
		"server.json": {Data: []byte(`{"library":{"entry":"./index.mjs"},"data":[{".name":"Thing"}]}`)},
		"sheet.json":  {Data: []byte(`{"slots":["body"]}`)},
	}
	p, err := Load(files)
	if err != nil {
		t.Fatal(err)
	}
	m := p.Manifest
	if m.Server.Library.Entry != "index.mjs" || len(m.Server.Data) != 1 {
		t.Fatalf("server: %+v", m.Server)
	}
	if m.Client.Library.Entries["http"] != "web/index.mjs" || m.Client.Library.Entries["android"] != "android/Index.kt" {
		t.Fatalf("client entries: %+v", m.Client.Library.Entries)
	}
	if provided := m.ClientProvides(); len(provided) != 1 || provided[0].Key() != "easel.h.sheet@1" || provided[0].File != "sheet.json" {
		t.Fatalf("client provides: %+v", provided)
	}
	if len(m.Provides()) != 0 {
		t.Fatal("client interfaces leaked into the server list")
	}
	for name, test := range map[string]struct {
		files fstest.MapFS
		want  string
	}{
		"missing side file":   {fstest.MapFS{FileName: {Data: []byte(`{"type":"module","name":"m","owner":"easel","host":"h","server":"./missing.json"}`)}}, "read server file"},
		"invalid client json": {fstest.MapFS{FileName: {Data: []byte(`{"type":"kit","name":"m","owner":"easel","host":"h","client":{"interfaces":[{"name":"x@1","file":"./x.json"}]}}`)}, "x.json": {Data: []byte(`{`)}}, "is not valid JSON"},
		"missing client file": {fstest.MapFS{FileName: {Data: []byte(`{"type":"kit","name":"m","owner":"easel","host":"h","client":{"interfaces":[{"name":"x@1","file":"./x.json"}]}}`)}}, "x.json"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Load(test.files); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

func TestSideRules(t *testing.T) {
	for name, test := range map[string]struct {
		data string
		want string
	}{
		"flat layout":        {`{"type":"module","name":"a","owner":"easel","host":"h","library":{"entry":"a.mjs"}}`, `unknown field "library"`},
		"client security":    {`{"type":"module","name":"a","owner":"easel","host":"h","client":{"security":{"http-entry":"a.mjs"}}}`, `unknown field "security"`},
		"client data":        {`{"type":"module","name":"a","owner":"easel","host":"h","client":{"data":[]}}`, `unknown field "data"`},
		"server entry name":  {`{"type":"module","name":"a","owner":"easel","host":"h","client":{"library":{"entry":"a.mjs"}}}`, "<client>-entry"},
		"no client entry":    {`{"type":"module","name":"a","owner":"easel","host":"h","client":{"library":{"required":{}}}}`, "at least one <client>-entry"},
		"client bare form":   {`{"type":"kit","name":"a","owner":"easel","host":"h","client":{"interfaces":["x@1"]}}`, "requires a JSON file"},
		"kit application":    {`{"type":"kit","name":"a","owner":"easel","host":"h","client":{"application":{"http-entry":"a.mjs"},"interfaces":[{"name":"x@1","file":"x.json"}]}}`, "kit cannot"},
		"client file path":   {`{"type":"module","name":"a","owner":"easel","host":"h","client":"./client.json"}`, "needs the package files"},
		"client requirement": {`{"type":"module","name":"a","owner":"easel","host":"h","client":{"library":{"http-entry":"a.mjs","required":{"interfaces":["easel.h.x"]}}}}`, "owner.host.member@version"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Parse([]byte(test.data)); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	if _, err := Parse([]byte(`{"type":"kit","name":"a","owner":"easel","host":"h","client":{"interfaces":[{"name":"x@1","file":"x.json"}]}}`)); err != nil {
		t.Fatalf("client-only kit: %v", err)
	}
}

func TestResolveClientSide(t *testing.T) {
	plan, err := Resolve(packages(t,
		`{"type":"application","name":"game","owner":"easel","host":"h","server":{"application":{"entry":"main.mjs"}},"client":{"application":{"http-entry":"app.mjs","android-entry":"App.kt","required":{"interfaces":["easel.h.sheet@1"]}}}}`,
		`{"type":"module","name":"ui","owner":"easel","host":"h","client":{"library":{"http-entry":"ui.mjs"},"interfaces":[{"name":"sheet@1","file":"sheet.json"}]}}`,
		`{"type":"module","name":"fancy","owner":"easel","host":"other","client":{"library":{"http-entry":"f.mjs","android-entry":"F.kt"},"implements":[{"name":"easel.h.sheet@1","file":"fancy.json"}]}}`,
	))
	if err != nil {
		t.Fatal(err)
	}
	library := []string{}
	for _, entry := range plan.ClientLibrary {
		library = append(library, entry.Package.ID())
	}
	if strings.Join(library, " ") != "easel.h.ui easel.other.fancy" || len(plan.ClientApplication) != 1 || plan.ClientApplication[0].Entries["android"] != "App.kt" {
		t.Fatalf("client plan: %v %+v", library, plan.ClientApplication)
	}
	if strings.Join(plan.Clients, " ") != "http" {
		t.Fatalf("supported clients: %v", plan.Clients)
	}
	for name, manifests := range map[string][]string{
		"client implements undeclared": {`{"type":"application","name":"game","owner":"easel","host":"h","server":{"application":{"entry":"main.mjs"}}}`, `{"type":"kit","name":"k","owner":"easel","host":"o","client":{"implements":[{"name":"easel.h.sheet@1","file":"x.json"}]}}`},
		"server requires client":       {`{"type":"application","name":"game","owner":"easel","host":"h","server":{"application":{"entry":"main.mjs","required":{"interfaces":["easel.o.sheet@1"]}}}}`, `{"type":"kit","name":"k","owner":"easel","host":"o","client":{"interfaces":[{"name":"sheet@1","file":"x.json"}]}}`},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Resolve(packages(t, manifests...)); err == nil || !strings.Contains(err.Error(), "which no package declares") {
				t.Fatalf("got %v", err)
			}
		})
	}
}
