package schema

import (
	"strings"
	"testing"

	"easel/internal/manifest"
)

func TestRetainSchemaRules(t *testing.T) {
	original := pkg(t, "base", "records", `[{".name":"Actor","name":{".type":"string"},"legacy":{".type":"string",".required":false}}]`, nil)
	rules, err := PackageRules([]manifest.Package{original})
	if err != nil {
		t.Fatal(err)
	}
	updated := pkg(t, "base", "records", `[{".name":"Actor","name":{".type":"string"},"portrait":{".type":"string",".required":false,".default":""}}]`, nil)
	retained, composed, err := RetainRules(rules, []manifest.Package{updated})
	if err != nil {
		t.Fatal(err)
	}
	actor := composed.Types["easel.base.Actor"]
	if actor.Fields["legacy"] == nil || actor.Fields["portrait"] == nil {
		t.Fatal("lost retained or new field")
	}
	if actor.Fields["legacy"].Owner != original.ID() {
		t.Fatal("lost field owner")
	}
	raw, err := actor.JSON()
	if err != nil || !strings.Contains(string(raw), `".default":""`) {
		t.Fatalf("lost default: %s %v", raw, err)
	}
	if _, loaded, err := RetainRules(retained, nil); err != nil || loaded.Types[actor.ID].Fields["portrait"] == nil {
		t.Fatalf("module removal lost schema: %v", err)
	}
	changed := pkg(t, "base", "records", `[{".name":"Actor","name":{".type":"integer"}}]`, nil)
	if _, _, err := RetainRules(retained, []manifest.Package{changed}); err == nil || !strings.Contains(err.Error(), "explicit migration") {
		t.Fatalf("unsafe type change accepted: %v", err)
	}
	if actor.Fields["name"].Type != TypeString {
		t.Fatal("failed reconciliation mutated active schema")
	}
}
