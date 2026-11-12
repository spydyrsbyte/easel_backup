package session

import (
	"strings"
	"testing"

	"easel/internal/manifest"
)

func TestOwnersSeparateInterfacesAndRecords(t *testing.T) {
	packages := []manifest.Package{}
	for _, owner := range []string{"alice", "bob"} {
		declaration := `{"type":"module","owner":"OWNER","host":"cards","name":"kit","server":{"library":{"entry":"library.mjs"},"interfaces":["deck@1"],"data":[{".name":"Deck","title":{".type":"string",".default":"OWNER"}}]}}`
		source := `Easel.Interfaces.register("OWNER.cards", "OWNER.cards.deck@1", class Deck { name(){ return "OWNER"; } });`
		packages = append(packages, newPackage(t, strings.ReplaceAll(declaration, "OWNER", owner), map[string]string{"library.mjs": strings.ReplaceAll(source, "OWNER", owner)}))
	}
	startup := `export function handleMessage(){
 const a = new alice.cards.Deck();
 const b = new bob.cards.Deck();
 return [a.type, a.title, b.type, b.title, Easel.Interfaces.create("alice.cards.deck@1").name(), Easel.Interfaces.create("bob.cards.deck@1").name()];
}`
	got := dispatchValue(t, append(application(t, "", startup), packages...))
	if got != `["alice.cards.Deck","alice","bob.cards.Deck","bob","alice","bob"]` {
		t.Fatalf("owner namespaces: %s", got)
	}
}
