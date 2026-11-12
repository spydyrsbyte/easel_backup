package session

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"easel/internal/manifest"
)

func dispatchValue(t *testing.T, packages []manifest.Package) string {
	t.Helper()
	s, err := NewGame(context.Background(), Game{Packages: packages})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	value, err := s.Dispatch(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	return string(value)
}

func diceKit(t *testing.T, register bool) manifest.Package {
	t.Helper()
	source := `import {sides} from "./shared/sides.mjs"; export class Dice { roll(){ return sides; } }`
	if register {
		source += ` Easel.Interfaces.register("easel.test","easel.test.dice@1",Dice);`
	}
	return newPackage(t, `{"type":"module","name":"dice","owner":"easel","host":"test","server":{"library":{"entry":"library/index.mjs"},"interfaces":["dice@1"]}}`, map[string]string{
		"library/index.mjs":        source,
		"library/shared/sides.mjs": `export const sides = 6;`,
	})
}

func implementer(t *testing.T, host string, sides int) manifest.Package {
	t.Helper()
	return newPackage(t, `{"type":"module","name":"dice","owner":"easel","host":"`+host+`","server":{"library":{"entry":"index.mjs"},"implements":[{"name":"easel.test.dice@1","file":"./dice.mjs"}]}}`, map[string]string{
		"index.mjs": ``,
		"dice.mjs":  `globalThis.loaded = (globalThis.loaded || []).concat("` + host + `"); export default class Dice { roll(){ return ` + strings.Repeat("1+", sides-1) + `1; } }`,
	})
}

func TestFileImplementationsLoadLazily(t *testing.T) {
	startup := `export function handleMessage(){
 const before = (globalThis.loaded || []).slice();
 const supports = Easel.Interfaces.supports("easel.test.dice@1");
 const listed = Easel.Interfaces.list("easel.test.dice@1");
 const afterList = (globalThis.loaded || []).slice();
 const rolled = listed[1].obj === listed[1].obj && new listed[1].obj().roll();
 const afterObj = (globalThis.loaded || []).slice();
 Easel.Interfaces.create("easel.test.dice@1","easel.alpha");
 return {before: before, supports: supports, afterList: afterList, rolled: rolled, afterObj: afterObj, final: globalThis.loaded};
}`
	packages := append(application(t, "", startup), diceKit(t, true), implementer(t, "alpha", 10), implementer(t, "beta", 20))
	want := `{"before":[],"supports":3,"afterList":[],"rolled":10,"afterObj":["alpha"],"final":["alpha"]}`
	if got := dispatchValue(t, packages); got != want {
		t.Fatalf("lazy loading:\n got %s\nwant %s", got, want)
	}
	broken := newPackage(t, `{"type":"module","name":"broken","owner":"easel","host":"zeta","server":{"library":{"entry":"index.mjs"},"implements":[{"name":"easel.test.dice@1","file":"./dice.mjs"}]}}`, map[string]string{
		"index.mjs": ``,
		"dice.mjs":  `export default 42;`,
	})
	unused := `export function handleMessage(){ return Easel.Interfaces.create("easel.test.dice@1").roll(); }`
	if got := dispatchValue(t, append(application(t, "", unused), diceKit(t, true), broken)); got != "6" {
		t.Fatalf("unused lazy file affected create: %s", got)
	}
	used := `export function handleMessage(){ return Easel.Interfaces.create("easel.test.dice@1","easel.zeta"); }`
	s, err := NewGame(context.Background(), Game{Packages: append(application(t, "", used), diceKit(t, true), broken)})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.Dispatch(context.Background(), json.RawMessage(`{}`)); err == nil || !strings.Contains(err.Error(), "must export a default class") {
		t.Fatalf("broken lazy file: %v", err)
	}
}

func TestInterfaceRegistry(t *testing.T) {
	startup := `export function handleMessage(){
 const listed = Easel.Interfaces.list("easel.test.dice@1").map(function(entry){return entry.name + "@" + entry.host + ":" + new entry.obj().roll();});
 let missing = "";
 try { Easel.Interfaces.create("easel.test.cards@1"); } catch (e) { missing = "thrown"; }
 return {
  supports: Easel.Interfaces.supports("easel.test.dice@1"),
  none: Easel.Interfaces.supports("easel.test.cards@1"),
  chosen: Easel.Interfaces.create("easel.test.dice@1").roll(),
  specific: Easel.Interfaces.create("easel.test.dice@1","easel.beta").roll(),
  listed: listed,
  missing: missing,
  closed: typeof Easel.Interfaces.register
 };
}`
	packages := append(application(t, "", startup), implementer(t, "alpha", 10), diceKit(t, true), implementer(t, "beta", 20))
	want := `{"supports":3,"none":0,"chosen":6,"specific":20,"listed":["easel.test.dice@easel.test:6","easel.test.dice@easel.alpha:10","easel.test.dice@easel.beta:20"],"missing":"thrown","closed":"undefined"}`
	if got := dispatchValue(t, packages); got != want {
		t.Fatalf("registry:\n got %s\nwant %s", got, want)
	}
}

func TestCreatePrefersFirstLoadedWithoutOriginal(t *testing.T) {
	startup := `export function handleMessage(){ return Easel.Interfaces.create("easel.test.dice@1").roll(); }`
	packages := append(application(t, "", startup), diceKit(t, false), implementer(t, "alpha", 10), implementer(t, "beta", 20))
	if got := dispatchValue(t, packages); got != "10" {
		t.Fatalf("chosen: %s", got)
	}
}

func TestModuleLoadingFailures(t *testing.T) {
	kit := func(t *testing.T, manifestJSON, source string) []manifest.Package {
		return application(t, "", "", newPackage(t, manifestJSON, map[string]string{"index.mjs": source}))
	}
	declaring := `{"type":"module","name":"k","owner":"easel","host":"test","server":{"library":{"entry":"index.mjs"},"interfaces":["dice@1"]}}`
	for name, test := range map[string]struct {
		packages func(t *testing.T) []manifest.Package
		want     string
	}{
		"bare import": {func(t *testing.T) []manifest.Package {
			return application(t, "", `import x from "easel.test.dice";`)
		}, "imports must be relative"},
		"escaping import": {func(t *testing.T) []manifest.Package {
			return application(t, "", `import x from "../outside.mjs";`)
		}, "leaves the package"},
		"missing file": {func(t *testing.T) []manifest.Package {
			return application(t, "", `import x from "./missing.mjs";`)
		}, "missing.mjs"},
		"encrypted": {func(t *testing.T) []manifest.Package {
			return kit(t, `{"type":"module","name":"locked","owner":"easel","host":"test","encrypt":{"public":"key.txt"},"server":{"library":{"entry":"index.mjs"},"interfaces":["dice@1"]}}`, ``)
		}, "not supported yet"},
		"thrown error": {func(t *testing.T) []manifest.Package {
			return application(t, "", `throw new Error("startup failed");`)
		}, "startup failed"},
		"unresolved packages": {func(t *testing.T) []manifest.Package {
			return []manifest.Package{diceKit(t, true)}
		}, "exactly one application"},
		"wrong host": {func(t *testing.T) []manifest.Package {
			return kit(t, declaring, `Easel.Interfaces.register("easel.other","easel.test.dice@1",class {});`)
		}, "cannot register an implementation for host easel.other"},
		"undeclared interface": {func(t *testing.T) []manifest.Package {
			return kit(t, declaring, `Easel.Interfaces.register("easel.test","easel.test.cards@1",class {});`)
		}, "does not declare or implement interface easel.test.cards@1"},
		"not a class": {func(t *testing.T) []manifest.Package {
			return kit(t, declaring, `Easel.Interfaces.register("easel.test","easel.test.dice@1",42);`)
		}, "must be a class"},
		"duplicate": {func(t *testing.T) []manifest.Package {
			return kit(t, declaring, `Easel.Interfaces.register("easel.test","easel.test.dice@1",class {}); Easel.Interfaces.register("easel.test","easel.test.dice@1",class {});`)
		}, "already registered"},
		"no library grant": {func(t *testing.T) []manifest.Package {
			return application(t, "", `Easel.Interfaces.register("easel.test","easel.test.dice@1",class {});`)
		}, "has no member 'register'"},
		"unknown host": {func(t *testing.T) []manifest.Package {
			return application(t, "", `Easel.Interfaces.create("easel.test.dice@1","easel.nobody");`, diceKit(t, true))
		}, "host easel.nobody has no implementation"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := NewGame(context.Background(), Game{Packages: test.packages(t)})
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

func TestInterfaceVersions(t *testing.T) {
	kit := newPackage(t, `{"type":"module","name":"dice","owner":"easel","host":"test","server":{"library":{"entry":"index.mjs"},"interfaces":[{"name":"dice","versions":[1,2]},{"name":"dice","file":"./v3.mjs","versions":[3,4]}]}}`, map[string]string{
		"index.mjs": `class Old { roll(){ return 1; } } class New { roll(){ return 2; } }
Easel.Interfaces.register("easel.test","easel.test.dice@1",Old);
Easel.Interfaces.register("easel.test","easel.test.dice@2",New);`,
		"v3.mjs": `export default class Lazy { roll(){ return 3; } }`,
	})
	other := newPackage(t, `{"type":"module","name":"dice","owner":"easel","host":"other","server":{"library":{"entry":"index.mjs"},"implements":["easel.test.dice@2"]}}`, map[string]string{
		"index.mjs": `Easel.Interfaces.register("easel.other","easel.test.dice@2",class { roll(){ return 22; } });`,
	})
	startup := `export function handleMessage(){
 const errors = [];
 for (const call of [function(){ Easel.Interfaces.supports("easel.test.dice"); }, function(){ Easel.Interfaces.create("easel.test.dice"); }]) {
  try { call(); } catch (e) { errors.push("thrown"); }
 }
 return {
  all: Easel.Interfaces.list("easel.test.dice").map(function(e){return e.version + "@" + e.host;}),
  two: Easel.Interfaces.list("easel.test.dice@2").map(function(e){return e.name + "@" + e.version + "@" + e.host;}),
  supports: [1,2,3,4,5].map(function(v){return Easel.Interfaces.supports("easel.test.dice@" + v);}),
  rolls: [Easel.Interfaces.create("easel.test.dice@1").roll(), Easel.Interfaces.create("easel.test.dice@2").roll(), Easel.Interfaces.create("easel.test.dice@2","easel.other").roll(), Easel.Interfaces.create("easel.test.dice@4").roll()],
  errors: errors
 };
}`
	packages := append(application(t, "", startup), kit, other)
	want := `{"all":["1@easel.test","2@easel.test","2@easel.other","3@easel.test","4@easel.test"],"two":["easel.test.dice@2@easel.test","easel.test.dice@2@easel.other"],"supports":[1,2,1,1,0],"rolls":[1,2,22,3],"errors":["thrown","thrown"]}`
	if got := dispatchValue(t, packages); got != want {
		t.Fatalf("versions:\n got %s\nwant %s", got, want)
	}
	unversioned := newPackage(t, `{"type":"module","name":"dice","owner":"easel","host":"test","server":{"library":{"entry":"index.mjs"},"interfaces":["dice@1"]}}`, map[string]string{
		"index.mjs": `Easel.Interfaces.register("easel.test","easel.test.dice",class {});`,
	})
	if _, err := NewGame(context.Background(), Game{Packages: application(t, "", "", unversioned)}); err == nil || !strings.Contains(err.Error(), "register requires an interface version") {
		t.Fatalf("unversioned register: %v", err)
	}
	undeclared := newPackage(t, `{"type":"module","name":"dice","owner":"easel","host":"test","server":{"library":{"entry":"index.mjs"},"interfaces":["dice@1"]}}`, map[string]string{
		"index.mjs": `Easel.Interfaces.register("easel.test","easel.test.dice@2",class {});`,
	})
	if _, err := NewGame(context.Background(), Game{Packages: application(t, "", "", undeclared)}); err == nil || !strings.Contains(err.Error(), "easel.test.dice@2") {
		t.Fatalf("undeclared version: %v", err)
	}
	lazyRegister := newPackage(t, `{"type":"module","name":"dice","owner":"easel","host":"test","server":{"library":{"entry":"index.mjs"},"interfaces":[{"name":"dice@1","file":"./lazy.mjs"}]}}`, map[string]string{
		"index.mjs": `Easel.Interfaces.register("easel.test","easel.test.dice@1",class {});`,
		"lazy.mjs":  `export default class {}`,
	})
	if _, err := NewGame(context.Background(), Game{Packages: application(t, "", "", lazyRegister)}); err == nil || !strings.Contains(err.Error(), "does not declare or implement interface easel.test.dice@1 in its library entry") {
		t.Fatalf("register over lazy entry: %v", err)
	}
}

func TestStartupComposesDataSchema(t *testing.T) {
	core := newPackage(t, `{"type":"module","name":"core","owner":"easel","host":"test","server":{"library":{"entry":"index.mjs"},"data":[{".name":"hero","hp":{".type":"integer"}}]}}`, map[string]string{"index.mjs": ``})
	extra := newPackage(t, `{"type":"module","name":"extra","owner":"easel","host":"other","server":{"library":{"entry":"index.mjs"},"data":[{".file":"./types.json"}]}}`, map[string]string{"index.mjs": ``, "types.json": `[{".modify":"easel.test.hero","mana":{".type":"integer"}}]`})
	s, err := NewGame(context.Background(), Game{Packages: application(t, "", "", core, extra)})
	if err != nil {
		t.Fatal(err)
	}
	s.Close()
	broken := newPackage(t, `{"type":"module","name":"broken","owner":"easel","host":"other","server":{"library":{"entry":"index.mjs"},"data":[{".modify":"easel.test.hero","hp":{".type":"string"}}]}}`, map[string]string{"index.mjs": ``})
	if _, err := NewGame(context.Background(), Game{Packages: application(t, "", "", core, broken)}); err == nil || !strings.Contains(err.Error(), "compose data schema") {
		t.Fatalf("conflicting field accepted: %v", err)
	}
}

func TestGlobalLibrariesLoadLazily(t *testing.T) {
	global := newPackage(t, `{"type":"module","name":"core","owner":"easel","host":"easel","server":{"library":{"entry":"index.mjs"},"interfaces":["dice@1"],"data":[{".name":"Thing"}]}}`, map[string]string{
		"index.mjs": `globalThis.coreLoads = (globalThis.coreLoads || 0) + 1; Easel.Interfaces.register("easel.easel","easel.easel.dice@1",class { roll(){ return 4; } });`,
	})
	startup := `export function handleMessage(){
 const before = globalThis.coreLoads || 0;
 const supports = Easel.Interfaces.supports("easel.easel.dice@1");
 const listed = Easel.Interfaces.list("easel.easel.dice@1").length;
 const beforeCreate = globalThis.coreLoads || 0;
 const roll = Easel.Interfaces.create("easel.easel.dice@1").roll();
 Easel.Interfaces.create("easel.easel.dice@1");
 return {before: before, supports: supports, listed: listed, beforeCreate: beforeCreate, roll: roll, after: globalThis.coreLoads, register: typeof Easel.Interfaces.register, thing: typeof easel.easel.Thing};
}`
	s, err := NewGame(context.Background(), Game{Packages: application(t, "", startup), Globals: []manifest.Package{global}})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	value, err := s.Dispatch(context.Background(), json.RawMessage(`{}`))
	want := `{"before":0,"supports":1,"listed":1,"beforeCreate":0,"roll":4,"after":1,"register":"undefined","thing":"function"}`
	if err != nil || string(value) != want {
		t.Fatalf("global library:\n got %s %v\nwant %s", value, err, want)
	}
	eager, err := NewGame(context.Background(), Game{Packages: application(t, "", `export function handleMessage(){ return globalThis.coreLoads || 0; }`, global), Globals: []manifest.Package{global}})
	if err != nil {
		t.Fatal(err)
	}
	defer eager.Close()
	if value, err := eager.Dispatch(context.Background(), json.RawMessage(`{}`)); err != nil || string(value) == "0" {
		t.Fatalf("listed global was not loaded as a normal package: %s %v", value, err)
	}
}
