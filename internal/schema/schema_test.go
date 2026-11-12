package schema

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"testing/fstest"

	"easel/internal/manifest"
)

func pkg(t *testing.T, host, name, data string, files map[string]string) manifest.Package {
	t.Helper()
	system := fstest.MapFS{manifest.FileName: {Data: []byte(`{"type":"module","name":"` + name + `","owner":"easel","host":"` + host + `","server":{"library":{"entry":"index.mjs"},"data":` + data + `}}`)}}
	for file, contents := range files {
		system[file] = &fstest.MapFile{Data: []byte(contents)}
	}
	p, err := manifest.Load(system)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func decode(t *testing.T, text string) map[string]any {
	t.Helper()
	value, err := decodeLiteral(json.RawMessage(text))
	if err != nil {
		t.Fatal(err)
	}
	return value.(map[string]any)
}

const character = `[
 {".name":"character",".description":"a hero",
  "name":{".type":"string",".validate":{".length":{"min":1,"max":12}}},
  "health":{".type":"field","max":{".type":"integer",".validate":{".min":1}},"hp":{".type":"integer",".validate":{".between":{"min":0,"max":{"@":"health.max"}}}}},
  "class":{".type":"string",".validate":{".in":["fighter","mage"]}},
  "tags":{".type":"set",".size":{"max":3},".validate":{".type":"string",".regex":"[a-z]+"}},
  "gold":{".type":"decimal",".validate":{".multipleOf":0.01}},
  "inventory":{".type":"map",".keys":{".regex":"item-[0-9]+"},".validate":{".type":"integer",".min":0}},
  "party":{".type":"array",".validate":{".type":"*character"}},
  "born":{".type":"datetime",".required":false},
  "title":{".type":"string",".required":false,".validate":{".not":{".in":["king"]}}},
  "rank":{".type":"integer",".required":false,".validate":{".or":[{".between":{"min":1,"max":3}},{".in":[10]}]}}
 },
 {".file":"./data/extra.json"}
]`

func composed(t *testing.T) *Schema {
	t.Helper()
	base := pkg(t, "acme", "core", character, map[string]string{"data/extra.json": `[{".name":"item","weight":{".type":"number"}}]`})
	magic := pkg(t, "magic", "spells", `[{".modify":"easel.acme.character","mana":{".type":"integer",".required":false,".validate":{".max":{"@":"health.max"}}}}]`, nil)
	s, err := Compose([]manifest.Package{magic, base})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestComposeDefinesAndModifies(t *testing.T) {
	s := composed(t)
	if got := strings.Join(s.Names(), " "); got != "easel.acme.character easel.acme.item" {
		t.Fatalf("types: %s", got)
	}
	hero := s.Types["easel.acme.character"]
	if hero.Owner != "easel.acme.core" || hero.Fields["mana"].Owner != "easel.magic.spells" || hero.Fields["name"].Owner != "easel.acme.core" {
		t.Fatalf("owners: %+v", hero)
	}
	if string(hero.Meta[".description"]) != `"a hero"` {
		t.Fatalf("meta not preserved: %v", hero.Meta)
	}
	if reference, ok := hero.Fields["party"].Validate.Type, true; !ok || reference != "*easel.acme.character" {
		t.Fatalf("reference not qualified: %s", reference)
	}
}

func TestComposeRejects(t *testing.T) {
	for name, test := range map[string]struct {
		packages func(t *testing.T) []manifest.Package
		want     string
	}{
		"duplicate type": {func(t *testing.T) []manifest.Package {
			return []manifest.Package{pkg(t, "a", "one", `[{".name":"x"}]`, nil), pkg(t, "a", "two", `[{".name":"x"}]`, nil)}
		}, "defined by both"},
		"unknown modify": {func(t *testing.T) []manifest.Package {
			return []manifest.Package{pkg(t, "a", "one", `[{".modify":"b.x","f":{".type":"string"}}]`, nil)}
		}, "no package defines"},
		"field conflict": {func(t *testing.T) []manifest.Package {
			return []manifest.Package{pkg(t, "a", "one", `[{".name":"x","f":{".type":"string"}}]`, nil), pkg(t, "b", "two", `[{".modify":"easel.a.x","f":{".type":"string"}}]`, nil)}
		}, "already defines"},
		"unknown reference": {func(t *testing.T) []manifest.Package {
			return []manifest.Package{pkg(t, "a", "one", `[{".name":"x","f":{".type":"*missing"}}]`, nil)}
		}, "unknown record type easel.a.missing"},
		"bad path": {func(t *testing.T) []manifest.Package {
			return []manifest.Package{pkg(t, "a", "one", `[{".name":"x","f":{".type":"integer",".validate":{".max":{"@":"nope"}}}}]`, nil)}
		}, "does not define"},
		"missing file": {func(t *testing.T) []manifest.Package {
			return []manifest.Package{pkg(t, "a", "one", `[{".file":"./missing.json"}]`, nil)}
		}, "missing.json"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Compose(test.packages(t)); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

func TestParseRejects(t *testing.T) {
	for name, test := range map[string]struct {
		declaration string
		want        string
	}{
		"no kind":            {`{"f":{".type":"string"}}`, "exactly one of"},
		"two kinds":          {`{".name":"x",".modify":"y"}`, "exactly one of"},
		"missing type":       {`{".name":"x","f":{".required":true}}`, "invalid or missing .type"},
		"unknown type":       {`{".name":"x","f":{".type":"float"}}`, "invalid or missing .type"},
		"nested non-object":  {`{".name":"x","f":{".type":"string","g":{".type":"string"}}}`, "not a field type"},
		"size on string":     {`{".name":"x","f":{".type":"string",".size":{"max":1}}}`, ".size applies"},
		"keys on array":      {`{".name":"x","f":{".type":"array",".keys":{}}}`, ".keys applies"},
		"and with others":    {`{".name":"x","f":{".type":"integer",".validate":{".and":[{".min":1}],".max":2}}}`, "only rule"},
		"or and and":         {`{".name":"x","f":{".type":"integer",".validate":{".and":[{".min":1}],".or":[{".max":2}]}}}`, "only rule"},
		"undotted rule":      {`{".name":"x","f":{".type":"integer",".validate":{"min":1}}}`, "must start with a dot"},
		"bad regex":          {`{".name":"x","f":{".type":"string",".validate":{".regex":"("}}}`, "missing closing"},
		"empty between":      {`{".name":"x","f":{".type":"integer",".validate":{".between":{}}}}`, "requires min or max"},
		"dotted bound":       {`{".name":"x","f":{".type":"integer",".validate":{".between":{".min":1}}}}`, "only min and max"},
		"file with fields":   {`{".file":"a.json","f":{".type":"string"}}`, "cannot declare fields"},
		"dotted type name":   {`{".name":"easel.a.b"}`, "invalid type name"},
		"required not bool":  {`{".name":"x","f":{".type":"string",".required":"no"}}`, "must be a boolean"},
		"empty or":           {`{".name":"x","f":{".type":"integer",".validate":{".or":[]}}}`, "non-empty list"},
		"unknown meta is ok": {`{".name":"x",".ui":{"color":"red"},"f":{".type":"string",".hint":1,".validate":{".note":"x"}}}`, ""},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := ParseDeclaration(json.RawMessage(test.declaration))
			if test.want == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

const valid = `{"name":"Ada","health":{"max":10,"hp":7},"class":"mage","tags":["brave","quick"],"gold":12.50,"inventory":{"item-1":2},"party":["c-2"],"born":"2026-10-24T12:00:00Z","rank":10,"mana":9}`

func TestValidateAcceptsRecord(t *testing.T) {
	if err := composed(t).Validate("easel.acme.character", decode(t, valid)); err != nil {
		t.Fatal(err)
	}
	minimal := `{"name":"Bo","health":{"max":1,"hp":0},"class":"fighter","tags":[],"gold":0,"inventory":{},"party":[]}`
	if err := composed(t).Validate("easel.acme.character", decode(t, minimal)); err != nil {
		t.Fatal(err)
	}
}

func TestValidateRejectsRecord(t *testing.T) {
	s := composed(t)
	for name, test := range map[string]struct {
		change func(map[string]any)
		want   string
	}{
		"missing required":   {func(r map[string]any) { delete(r, "class") }, "missing required field class"},
		"undeclared":         {func(r map[string]any) { r["extra"] = 1 }, "undeclared field extra"},
		"wrong type":         {func(r map[string]any) { r["name"] = json.Number("3") }, "must be string"},
		"length":             {func(r map[string]any) { r["name"] = "" }, "below the minimum"},
		"nested reference":   {func(r map[string]any) { r["health"].(map[string]any)["hp"] = json.Number("11") }, "above the maximum 10"},
		"nested minimum":     {func(r map[string]any) { r["health"] = map[string]any{"max": json.Number("0"), "hp": json.Number("0")} }, "below the minimum"},
		"not integer":        {func(r map[string]any) { r["health"].(map[string]any)["max"] = json.Number("1.5") }, "must be integer"},
		"in":                 {func(r map[string]any) { r["class"] = "thief" }, "not one of the allowed values"},
		"set duplicate":      {func(r map[string]any) { r["tags"] = []any{"a", "a"} }, "must be set"},
		"set size":           {func(r map[string]any) { r["tags"] = []any{"a", "b", "c", "d"} }, "size 4 is above the maximum 3"},
		"set element regex":  {func(r map[string]any) { r["tags"] = []any{"Brave"} }, "does not match"},
		"multiple of":        {func(r map[string]any) { r["gold"] = json.Number("1.005") }, "not a multiple"},
		"map key":            {func(r map[string]any) { r["inventory"] = map[string]any{"sword": json.Number("1")} }, "key sword does not match"},
		"map value":          {func(r map[string]any) { r["inventory"] = map[string]any{"item-1": json.Number("-1")} }, "below the minimum"},
		"reference element":  {func(r map[string]any) { r["party"] = []any{json.Number("2")} }, "must be *easel.acme.character"},
		"datetime":           {func(r map[string]any) { r["born"] = "yesterday" }, "must be datetime"},
		"not":                {func(r map[string]any) { r["title"] = "king" }, "must not match"},
		"or":                 {func(r map[string]any) { r["rank"] = json.Number("5") }, "none of the alternatives"},
		"modified field":     {func(r map[string]any) { r["mana"] = json.Number("11") }, "above the maximum 10"},
		"missing reference":  {func(r map[string]any) { delete(r["health"].(map[string]any), "max") }, "missing required field max"},
		"null is not string": {func(r map[string]any) { r["name"] = nil }, "must be string"},
	} {
		t.Run(name, func(t *testing.T) {
			record := decode(t, valid)
			test.change(record)
			if err := s.Validate("easel.acme.character", record); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	if err := s.Validate("easel.acme.missing", map[string]any{}); err == nil || !strings.Contains(err.Error(), "unknown record type") {
		t.Fatalf("unknown type: %v", err)
	}
}

func TestEventTypesUseRecordReferences(t *testing.T) {
	s := composed(t)
	lookups := map[string]string{"c-1": "easel.acme.character", "i-1": "easel.acme.item"}
	types := EventTypes{Schema: s, Lookup: func(_ context.Context, id string) (string, error) {
		found, ok := lookups[id]
		if !ok {
			return "", fmt.Errorf("record %s does not exist", id)
		}
		return found, nil
	}}
	if err := types.Resolve("*easel.acme.character"); err != nil {
		t.Fatal(err)
	}
	for name, test := range map[string]struct {
		typeName string
		want     string
	}{
		"bare type":    {"easel.acme.character", "must be a builtin or a record reference"},
		"unknown type": {"*easel.acme.missing", "unknown record type"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := types.Resolve(test.typeName); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	ctx := context.Background()
	if err := types.Validate(ctx, "*easel.acme.character", json.RawMessage(`"c-1"`)); err != nil {
		t.Fatal(err)
	}
	for payload, want := range map[string]string{`"i-1"`: "is a easel.acme.item", `"x"`: "does not exist", `7`: "expected the ID"} {
		if err := types.Validate(ctx, "*easel.acme.character", json.RawMessage(payload)); err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%s: got %v, want %q", payload, err, want)
		}
	}
}

func TestReferencesCheckRecordTypes(t *testing.T) {
	s := composed(t)
	lookup := func(id string) (string, error) {
		if id == "c-2" {
			return "easel.acme.character", nil
		}
		if id == "i-1" {
			return "easel.acme.item", nil
		}
		return "", fmt.Errorf("record %s does not exist", id)
	}
	if err := s.ValidateWith("easel.acme.character", decode(t, valid), lookup); err != nil {
		t.Fatal(err)
	}
	for party, want := range map[string]string{`["i-1"]`: "of type easel.acme.item, not easel.acme.character", `["gone"]`: "does not exist"} {
		record := decode(t, valid)
		record["party"] = decode(t, `{"p":`+party+`}`)["p"]
		if err := s.ValidateWith("easel.acme.character", record, lookup); err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%s: got %v, want %q", party, err, want)
		}
	}
}

func TestEffectiveSchemaEncoding(t *testing.T) {
	data, err := composed(t).Types["easel.acme.character"].JSON()
	if err != nil {
		t.Fatal(err)
	}
	document := decode(t, string(data))
	if document[".name"] != "easel.acme.character" || document[".owner"] != "easel.acme.core" || document[".description"] != "a hero" {
		t.Fatalf("type meta: %v", document)
	}
	mana := document["mana"].(map[string]any)
	if mana[".owner"] != "easel.magic.spells" || mana[".required"] != false {
		t.Fatalf("modified field: %v", mana)
	}
	hp := document["health"].(map[string]any)["hp"].(map[string]any)
	reference := hp[".validate"].(map[string]any)[".between"].(map[string]any)["max"].(map[string]any)["@"]
	if reference != "health.max" {
		t.Fatalf("reference: %v", hp)
	}
	if tags := document["tags"].(map[string]any); tags[".validate"].(map[string]any)[".regex"] != "[a-z]+" {
		t.Fatalf("regex: %v", tags)
	}
	field, err := parseField(json.RawMessage(mustJSON(t, document["health"])), "health")
	if err != nil || field.Fields["hp"].Validate.Between.Max.Path != "health.max" {
		t.Fatalf("round trip: %+v %v", field, err)
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestExtendsInheritsComposedFields(t *testing.T) {
	core := pkg(t, "pf", "core", `[{".name":"Character","hp":{".type":"integer",".default":10}},{".name":"Familiar",".extends":"Character","master":{".type":"*Character"}}]`, nil)
	fear := pkg(t, "terror", "fear", `[{".modify":"easel.pf.Character","fear":{".type":"integer"}}]`, nil)
	s, err := Compose([]manifest.Package{core, fear})
	if err != nil {
		t.Fatal(err)
	}
	familiar := s.Types["easel.pf.Familiar"]
	if familiar.Parent != "easel.pf.Character" || familiar.Fields["fear"].Owner != "easel.terror.fear" || familiar.Fields["master"].Owner != "easel.pf.core" || len(familiar.Local) != 1 {
		t.Fatalf("familiar: %+v", familiar)
	}
	if !s.IsA("easel.pf.Familiar", "easel.pf.Character") || s.IsA("easel.pf.Character", "easel.pf.Familiar") {
		t.Fatal("IsA")
	}
	if !s.Types["easel.pf.Character"].Fields["hp"].HasDefault {
		t.Fatal("default lost")
	}
	if err := s.ValidateWith("easel.pf.Familiar", map[string]any{"hp": json.Number("1"), "fear": json.Number("0"), "master": "f-2"}, func(string) (string, error) { return "easel.pf.Familiar", nil }); err != nil {
		t.Fatalf("subtype as reference target: %v", err)
	}
	for name, test := range map[string]struct {
		packages []manifest.Package
		want     string
	}{
		"redeclared":   {[]manifest.Package{pkg(t, "a", "one", `[{".name":"X","f":{".type":"string"}},{".name":"Y",".extends":"X","f":{".type":"string"}}]`, nil)}, "redeclares field f"},
		"cycle":        {[]manifest.Package{pkg(t, "a", "one", `[{".name":"X",".extends":"Y"},{".name":"Y",".extends":"X"}]`, nil)}, "extends itself"},
		"unknown":      {[]manifest.Package{pkg(t, "a", "one", `[{".name":"X",".extends":"Missing"}]`, nil)}, "which no package defines"},
		"modify clash": {[]manifest.Package{pkg(t, "a", "one", `[{".name":"X"},{".name":"Y",".extends":"X","f":{".type":"string"}}]`, nil), pkg(t, "b", "two", `[{".modify":"easel.a.X","f":{".type":"string"}}]`, nil)}, "redeclares field f"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Compose(test.packages); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	for declaration, want := range map[string]string{
		`{".extends":"X"}`:                         ".extends requires .name",
		`{".name":"has-dash"}`:                     "JavaScript identifier",
		`{".name":"class"}`:                        "JavaScript identifier",
		`{".name":"X","save":{".type":"string"}}`:  "reserved",
		`{".name":"X","_data":{".type":"string"}}`: "reserved",
	} {
		if _, err := ParseDeclaration(json.RawMessage(declaration)); err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%s: got %v, want %q", declaration, err, want)
		}
	}
}
