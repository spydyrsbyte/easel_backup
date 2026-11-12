package session

import (
	"context"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"easel/internal/manifest"
	"easel/internal/platform"
)

type kitReadFS struct {
	fs.FS
	reads  map[string]int
	prefix string
}

func (f kitReadFS) ReadFile(name string) ([]byte, error) {
	if strings.HasPrefix(name, "server/") && strings.HasSuffix(name, ".mjs") {
		f.reads[f.prefix+"/"+name]++
	}
	return fs.ReadFile(f.FS, name)
}

type kitCatalog struct {
	Host    string `json:"host"`
	Members []struct {
		Name     string `json:"name"`
		Side     string `json:"side"`
		Examples []struct {
			Method   string `json:"method"`
			Args     []any  `json:"args"`
			Expected any    `json:"expected"`
			Throws   bool   `json:"throws"`
		} `json:"examples"`
	} `json:"members"`
}

func TestKitMembersInSobek(t *testing.T) {
	root := filepath.Join("..", "..", "server", "easel", "server")
	definition, err := platform.Load(root)
	if err != nil {
		t.Fatal(err)
	}
	reads := map[string]int{}
	for i, pkg := range definition.Libraries {
		pkg.Files = kitReadFS{FS: pkg.Files, reads: reads, prefix: pkg.ID()}
		definition.Libraries[i] = pkg
	}
	startup := `export function handleMessage(message){return Easel.Interfaces.create(message.interface)[message.method](...message.args);}`
	runtime, err := NewGame(context.Background(), Game{Packages: application(t, "", startup), Globals: definition.Libraries})
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	if len(reads) != 0 {
		t.Fatalf("importing Kit catalogs read implementation files: %v", reads)
	}
	for _, pkg := range definition.Libraries {
		if pkg.Manifest.Type != manifest.TypeKit {
			continue
		}
		data, err := os.ReadFile(filepath.Join(root, "library", pkg.Manifest.Host, "catalog.json"))
		if err != nil {
			t.Fatal(err)
		}
		var catalog kitCatalog
		if err = json.Unmarshal(data, &catalog); err != nil {
			t.Fatal(err)
		}
		for _, member := range catalog.Members {
			if member.Side != "server" {
				continue
			}
			t.Run(catalog.Host+"."+member.Name, func(t *testing.T) {
				for _, example := range member.Examples {
					payload, _ := json.Marshal(map[string]any{"interface": "easel." + catalog.Host + "." + member.Name + "@1", "method": example.Method, "args": example.Args})
					result, err := runtime.Dispatch(context.Background(), payload)
					if example.Throws {
						if err == nil {
							t.Fatalf("accepted invalid input: %s", payload)
						}
						continue
					}
					if err != nil {
						t.Fatalf("%s: %v", payload, err)
					}
					var actual any
					if err = json.Unmarshal(result, &actual); err != nil {
						t.Fatal(err)
					}
					if !reflect.DeepEqual(actual, example.Expected) {
						t.Fatalf("%s: got %#v, want %#v", payload, actual, example.Expected)
					}
				}
			})
		}
	}
	for name, count := range reads {
		if count != 1 {
			t.Errorf("implementation %s loaded %d times", name, count)
		}
	}
}

func TestKitLazyMemberIsolation(t *testing.T) {
	definition, err := platform.Load(filepath.Join("..", "..", "server", "easel", "server"))
	if err != nil {
		t.Fatal(err)
	}
	reads := map[string]int{}
	for i, p := range definition.Libraries {
		p.Files = kitReadFS{FS: p.Files, reads: reads, prefix: p.ID()}
		definition.Libraries[i] = p
	}
	startup := `export function handleMessage(m){const member=Easel.Interfaces.create("easel.collections."+m.name+"@1");return member.create(m.values);}`
	runtime, err := NewGame(context.Background(), Game{Packages: application(t, "", startup), Globals: definition.Libraries})
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	if len(reads) != 0 {
		t.Fatal("Kit import loaded code")
	}
	for _, payload := range []string{`{"name":"ordered","values":["a"]}`, `{"name":"ordered","values":["b"]}`} {
		if _, err = runtime.Dispatch(context.Background(), json.RawMessage(payload)); err != nil {
			t.Fatal(err)
		}
	}
	if len(reads) != 2 || reads["easel.collections.collections/server/ordered.mjs"] != 1 || reads["easel.collections.collections/server/support.mjs"] != 1 {
		t.Fatalf("ordered member loaded unrelated code: %v", reads)
	}
	if _, err = runtime.Dispatch(context.Background(), json.RawMessage(`{"name":"set","values":["a","a"]}`)); err != nil {
		t.Fatal(err)
	}
	if len(reads) != 3 || reads["easel.collections.collections/server/set.mjs"] != 1 {
		t.Fatalf("second member did not load independently: %v", reads)
	}
	fresh, err := NewGame(context.Background(), Game{Packages: application(t, "", startup), Globals: definition.Libraries})
	if err != nil {
		t.Fatal(err)
	}
	defer fresh.Close()
	if _, err = fresh.Dispatch(context.Background(), json.RawMessage(`{"name":"ordered","values":["new-game"]}`)); err != nil {
		t.Fatal(err)
	}
	if reads["easel.collections.collections/server/ordered.mjs"] != 2 {
		t.Fatal("different games must not share a JavaScript runtime")
	}
}

func TestKitRandomService(t *testing.T) {
	startup := `export function handleMessage(){const failures=[];for(const args of [[0,0],[3,2],[0,1.5],["0",2],[0,Infinity]]){try{Easel.Random.integer(...args);failures.push(args);}catch{}}for(let i=0;i<200;i++){const n=Easel.Random.integer(-10,11),f=Easel.Random.fraction();if(n< -10||n>=11||!Number.isSafeInteger(n)||f<0||f>=1)throw new Error("random range");}return {failures,unique:new Set(Array.from({length:100},()=>Easel.Random.integer(0,1000000))).size>1,frozen:Object.isFrozen(Easel.Random)};}`
	got := dispatchValue(t, application(t, "", startup))
	if got != `{"failures":[],"unique":true,"frozen":true}` {
		t.Fatal(got)
	}
}
