package session

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"testing"

	"easel/internal/automation"
	"easel/internal/manifest"
	"easel/internal/schema"
)

type memoryRecords struct {
	schema *schema.Schema
	rows   map[string]automation.Record
	next   int
}

type memoryRecordTx struct {
	store   *memoryRecords
	pending map[string]*automation.Record
}

func copyValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		copied := make(map[string]any, len(typed))
		for key, item := range typed {
			copied[key] = copyValue(item)
		}
		return copied
	case []any:
		copied := make([]any, len(typed))
		for index, item := range typed {
			copied[index] = copyValue(item)
		}
		return copied
	}
	return value
}

func copyRecord(record automation.Record) automation.Record {
	record.Data = copyValue(record.Data).(map[string]any)
	return record
}

func (store *memoryRecords) Begin(context.Context) (automation.Transaction, error) {
	return &memoryRecordTx{store: store, pending: map[string]*automation.Record{}}, nil
}

func (tx *memoryRecordTx) current(id string) (automation.Record, bool) {
	if pending, found := tx.pending[id]; found {
		if pending == nil {
			return automation.Record{}, false
		}
		return *pending, true
	}
	record, found := tx.store.rows[id]
	return record, found
}

func (tx *memoryRecordTx) lookup(id string) (string, error) {
	record, found := tx.current(id)
	if !found {
		return "", fmt.Errorf("record %s does not exist", id)
	}
	return record.Type, nil
}

func (tx *memoryRecordTx) Load(_ context.Context, typeName, id string) (automation.Record, error) {
	record, found := tx.current(id)
	if !found {
		return automation.Record{}, fmt.Errorf("%s record %s does not exist", typeName, id)
	}
	if !tx.store.schema.IsA(record.Type, typeName) {
		return automation.Record{}, fmt.Errorf("record %s is a %s, not a %s", id, record.Type, typeName)
	}
	return copyRecord(record), nil
}

func (tx *memoryRecordTx) Save(_ context.Context, record automation.Record) error {
	if err := tx.store.schema.ValidateWith(record.Type, record.Data, tx.lookup); err != nil {
		return err
	}
	saved := copyRecord(record)
	tx.pending[record.ID] = &saved
	return nil
}

func (tx *memoryRecordTx) Create(ctx context.Context, record automation.Record) (automation.Record, error) {
	tx.store.next++
	record.ID = fmt.Sprintf("r-%d", tx.store.next)
	record.Version = 1
	return record, tx.Save(ctx, record)
}

func (tx *memoryRecordTx) Remove(_ context.Context, record automation.Record) error {
	tx.pending[record.ID] = nil
	return nil
}

func (tx *memoryRecordTx) Commit(context.Context) error {
	for id, record := range tx.pending {
		if record == nil {
			delete(tx.store.rows, id)
		} else {
			tx.store.rows[id] = *record
		}
	}
	return nil
}

func (tx *memoryRecordTx) Rollback(context.Context) error { return nil }

func (tx *memoryRecordTx) IDs(_ context.Context, typeName string) ([]string, error) {
	ids := []string{}
	seen := map[string]bool{}
	for id := range tx.pending {
		seen[id] = true
	}
	for id := range tx.store.rows {
		seen[id] = true
	}
	for id := range seen {
		if record, found := tx.current(id); found && tx.store.schema.IsA(record.Type, typeName) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids, nil
}

const recordGame = `{"type":"application","name":"game","owner":"easel","host":"pathfinder","server":{"application":{"entry":"main.mjs"},"data":[
 {".name":"Character","name":{".type":"string"},"nickname":{".type":"string",".required":false},
  "hp":{".type":"integer",".default":10},
  "abilities":{".type":"field","strength":{".type":"field","value":{".type":"integer",".default":10}}}},
 {".name":"Familiar",".extends":"Character","master":{".type":"*Character"}}
]}}`

const recordStartup = `
export function handleMessage(m) {
  if (m.op === "create") {
    const c = new easel.pathfinder.Character();
    c.name = "Ada";
    c.abilities.strength.value = 14;
    c.frighten(6);
    c.damage(3);
    c.save();
    return {id: c.id, type: c.type, hp: c.hp, str: c.abilities.strength.value, frightened: c.frightened, log: c.log, nickname: c.nickname};
  }
  if (m.op === "load") {
    const c = new easel.pathfinder.Character(m.id);
    return {hp: c.hp, fear: c.fear.level, str: c.abilities.strength.value, nickname: c.nickname, log: c.log};
  }
  if (m.op === "rename") {
    const c = new easel.pathfinder.Character(m.id);
    c.nickname = "Bob";
    c.save();
    return true;
  }
  if (m.op === "typo") {
    const c = new easel.pathfinder.Character(m.id);
    c.hpp = 1;
  }
  if (m.op === "familiar") {
    const f = new easel.pathfinder.Familiar();
    f.name = "Tib";
    f.master = m.id;
    f.frighten(2);
    f.save();
    const again = new easel.pathfinder.Familiar(f.id);
    const asCharacter = new easel.pathfinder.Character(f.id);
    return {type: again.type, master: again.master, fear: again.fear.level, isCharacter: again instanceof easel.pathfinder.Character, viewType: asCharacter.type};
  }
  if (m.op === "hero") {
    const h = new Hero(m.id);
    return {title: h.title, type: h.type, hp: h.hp};
  }
  if (m.op === "invalid") {
    const c = new easel.pathfinder.Character();
    c.save();
  }
  if (m.op === "abort") {
    const c = new easel.pathfinder.Character();
    c.name = "Ghost";
    c.save();
    throw new Error("abort after save");
  }
  if (m.op === "unsaved") {
    const c = new easel.pathfinder.Character(m.id);
    c.hp = 1;
    return true;
  }
  if (m.op === "remove") {
    new easel.pathfinder.Character(m.id).remove();
    return true;
  }
  if (m.op === "direct") {
    new Easel.Record();
  }
  return null;
}
`

func recordPackages(t *testing.T) []manifest.Package {
	t.Helper()
	game := newPackage(t, recordGame, map[string]string{"main.mjs": recordStartup + `import {Hero} from "./hero.mjs"; globalThis.Hero = Hero;`, "hero.mjs": `export class Hero extends easel.pathfinder.Character { get title() { return "Sir " + this.name; } }`})
	fear := newPackage(t, `{"type":"module","name":"fear","owner":"easel","host":"terror","server":{"library":{"entry":"fear.mjs"},"data":[{".modify":"easel.pathfinder.Character","fear":{".type":"field","level":{".type":"integer",".default":0}}}]}}`, map[string]string{
		"fear.mjs": `export class Character extends easel.pathfinder.Character {
  nickname = "none";
  frighten(n) { this.fear.level += n; }
  get frightened() { return this.fear.level >= 5; }
  damage(n) { this.hp -= n; }
}`,
	})
	magic := newPackage(t, `{"type":"module","name":"magic","owner":"easel","host":"arcane","server":{"library":{"entry":"magic.mjs"}}}`, map[string]string{
		"magic.mjs": `export class Character extends easel.pathfinder.Character {
  log = "none";
  damage(n) { super.damage(n); this.log = "magic"; }
}`,
	})
	return []manifest.Package{game, fear, magic}
}

func recordGameSession(t *testing.T) (Runtime, *memoryRecords) {
	t.Helper()
	packages := recordPackages(t)
	plan, err := manifest.Resolve(packages)
	if err != nil {
		t.Fatal(err)
	}
	composed, err := schema.Compose(plan.Packages)
	if err != nil {
		t.Fatal(err)
	}
	store := &memoryRecords{schema: composed, rows: map[string]automation.Record{}}
	s, err := NewGame(context.Background(), Game{Packages: packages, Records: store, Debug: true})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s, store
}

func call(t *testing.T, s Runtime, message string) (map[string]any, error) {
	t.Helper()
	value, err := s.Dispatch(context.Background(), json.RawMessage(message))
	if err != nil {
		return nil, err
	}
	var decoded map[string]any
	_ = json.Unmarshal(value, &decoded)
	return decoded, nil
}

func TestRecordClassesLayerAndPersist(t *testing.T) {
	s, store := recordGameSession(t)
	created, err := call(t, s, `{"op":"create"}`)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"id": "r-1", "type": "easel.pathfinder.Character", "hp": float64(7), "str": float64(14), "frightened": true, "log": "magic", "nickname": "none"}
	for key, value := range want {
		if created[key] != value {
			t.Fatalf("create %s: got %v, want %v (%v)", key, created[key], value, created)
		}
	}
	stored := store.rows["r-1"].Data
	if _, runtime := stored["log"]; runtime || stored["nickname"] != "none" {
		t.Fatalf("stored data: %v", stored)
	}
	if _, err := call(t, s, `{"op":"rename","id":"r-1"}`); err != nil {
		t.Fatal(err)
	}
	loaded, err := call(t, s, `{"op":"load","id":"r-1"}`)
	if err != nil {
		t.Fatal(err)
	}
	if loaded["hp"] != float64(7) || loaded["fear"] != float64(6) || loaded["str"] != float64(14) || loaded["nickname"] != "Bob" || loaded["log"] != "none" {
		t.Fatalf("load: %v", loaded)
	}
	hero, err := call(t, s, `{"op":"hero","id":"r-1"}`)
	if err != nil || hero["title"] != "Sir Ada" || hero["type"] != "easel.pathfinder.Character" || hero["hp"] != float64(7) {
		t.Fatalf("code-only subclass: %v %v", hero, err)
	}
	familiar, err := call(t, s, `{"op":"familiar","id":"r-1"}`)
	if err != nil {
		t.Fatal(err)
	}
	if familiar["type"] != "easel.pathfinder.Familiar" || familiar["master"] != "r-1" || familiar["fear"] != float64(2) || familiar["isCharacter"] != true || familiar["viewType"] != "easel.pathfinder.Familiar" {
		t.Fatalf("familiar: %v", familiar)
	}
	if _, err := call(t, s, `{"op":"remove","id":"r-1"}`); err != nil {
		t.Fatal(err)
	}
	if _, found := store.rows["r-1"]; found {
		t.Fatal("removed record still stored")
	}
}

func TestRecordFailuresAndWarnings(t *testing.T) {
	s, store := recordGameSession(t)
	if _, err := call(t, s, `{"op":"create"}`); err != nil {
		t.Fatal(err)
	}
	for name, test := range map[string]struct {
		message string
		want    string
	}{
		"typo":     {`{"op":"typo","id":"r-1"}`, "TypeError"},
		"invalid":  {`{"op":"invalid"}`, "missing required field name"},
		"missing":  {`{"op":"load","id":"nope"}`, "does not exist"},
		"wrong":    {`{"op":"familiar","id":"nope"}`, "does not exist"},
		"abort":    {`{"op":"abort"}`, "abort after save"},
		"abstract": {`{"op":"direct"}`, "cannot be constructed directly"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := call(t, s, test.message); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
	for _, record := range store.rows {
		if record.Data["name"] == "Ghost" {
			t.Fatal("aborted request kept its saved record")
		}
	}
	if _, err := call(t, s, `{"op":"unsaved","id":"r-1"}`); err != nil {
		t.Fatal(err)
	}
	if store.rows["r-1"].Data["hp"] == int64(1) {
		t.Fatal("unsaved change was stored")
	}
	found := false
	for _, warning := range s.Warnings() {
		if strings.Contains(warning, "changed but never saved") {
			found = true
		}
	}
	if !found {
		t.Fatalf("warnings: %v", s.Warnings())
	}
}

func TestRecordsUnavailableBeforeDataReady(t *testing.T) {
	packages := recordPackages(t)
	packages[1] = newPackage(t, `{"type":"module","name":"fear","owner":"easel","host":"terror","server":{"library":{"entry":"fear.mjs"}}}`, map[string]string{"fear.mjs": `new easel.pathfinder.Character();`})
	if _, err := NewGame(context.Background(), Game{Packages: packages}); err == nil || !strings.Contains(err.Error(), "not available until Load.Data.Ready") {
		t.Fatalf("early record access: %v", err)
	}
	duplicate := newPackage(t, `{"type":"module","name":"twice","owner":"easel","host":"twice","server":{"library":{"entry":"a.mjs"}}}`, map[string]string{
		"a.mjs": `import "./b.mjs"; export class Character extends easel.pathfinder.Character {}`,
		"b.mjs": `export class Character extends easel.pathfinder.Character {}`,
	})
	if _, err := NewGame(context.Background(), Game{Packages: append(recordPackages(t), duplicate)}); err == nil || !strings.Contains(err.Error(), "more than one layer") {
		t.Fatalf("duplicate layer: %v", err)
	}
}
