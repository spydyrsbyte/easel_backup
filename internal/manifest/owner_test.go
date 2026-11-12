package manifest

import (
	"encoding/json"
	"testing"
)

func TestOwnerHostMemberIdentity(t *testing.T) {
	m := parse(t, `{"type":"module","owner":"easel","host":"cards","name":"table","version":{"major":1,"minor":0,"revision":0},"server":{"library":{"entry":"library.mjs"},"interfaces":["surface@1"]}}`)
	if m.Namespace() != "easel.cards" || m.ID() != "easel.cards.table" || m.InterfaceID("surface") != "easel.cards.surface" {
		t.Fatalf("identity: %+v", m)
	}
	m.Version = Version{Major: 9, Minor: 8, Revision: 7}
	m.Name = "renamed"
	if m.Namespace() != "easel.cards" || m.InterfaceID("surface") != "easel.cards.surface" {
		t.Fatal("package name or version changed the interface namespace")
	}
	for field, values := range map[string][]string{
		"owner": {"", "two.parts", "class", "bad-name", "__proto__"},
		"host":  {"", "two.parts", "class", "bad-name", "constructor"},
		"name":  {"", "two.parts", "class", "bad-name"},
	} {
		for _, value := range values {
			t.Run(field+"/"+value, func(t *testing.T) {
				data := map[string]any{"type": "module", "owner": "easel", "host": "cards", "name": "table", "server": map[string]any{"library": map[string]any{"entry": "library.mjs"}}}
				data[field] = value
				encoded, _ := json.Marshal(data)
				if _, err := Parse(encoded); err == nil {
					t.Fatalf("accepted %s %q", field, value)
				}
			})
		}
	}
}
