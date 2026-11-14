package session

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"easel/internal/automation"
	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/platform"
	"easel/internal/schema"
	"easel/internal/security"
)

type vttTestStore struct {
	memorySecurityStore
	records *memoryRecords
	roles   map[string]string
}

func (s *vttTestStore) Begin(context.Context) (security.Transaction, error) { return s, nil }

func (s *vttTestStore) ResolvePrincipal(_ context.Context, id string) (security.Entity, error) {
	return security.Entity{ID: id, Type: security.UserType, Attributes: map[string]any{"role": s.roles[id]}}, nil
}

func (s *vttTestStore) ResolveEntity(_ context.Context, id string) (security.Entity, error) {
	record, found := s.records.rows[id]
	if !found {
		return security.Entity{}, security.ErrDenied
	}
	return security.Entity{ID: id, Type: record.Type, Attributes: record.Data}, nil
}

func vttModule(t *testing.T) manifest.Package {
	t.Helper()
	pkg, err := manifest.Load(os.DirFS("../../server/easel/modules/vtt"))
	if err != nil {
		t.Fatalf("load vtt: %v", err)
	}
	return pkg
}

func TestVTTSecurityPolicies(t *testing.T) {
	pkg := vttModule(t)
	composed, err := schema.Compose([]manifest.Package{pkg})
	if err != nil {
		t.Fatalf("compose: %v", err)
	}
	records := &memoryRecords{schema: composed, rows: map[string]automation.Record{
		"scene-1": {Type: "easel.vtt.Scene", ID: "scene-1", Data: map[string]any{}},
		"token-1": {Type: "easel.vtt.Token", ID: "token-1", Data: map[string]any{}},
		"dice-1":  {Type: "easel.vtt.DiceSettings", ID: "dice-1", Data: map[string]any{"userId": "bob"}},
	}}
	store := &vttTestStore{memorySecurityStore: memorySecurityStore{relationships: map[security.Relationship]bool{}}, records: records, roles: map[string]string{"gm": "administrator", "bob": "player", "carol": "player", "sam": "spectator"}}
	service, err := jsapi.BuildSecurity(context.Background(), &jsapi.SecurityConfig{BuildID: "vtt-test", Store: store}, "", []manifest.Entry{{Package: pkg, Path: "server/security.mjs"}}, composed)
	if err != nil {
		t.Fatalf("build security: %v", err)
	}
	check := func(user, resource, action string, want bool) {
		t.Helper()
		decision, err := service.Authorize(security.WithPrincipal(context.Background(), user), security.AuthorizationRequest{ResourceID: resource, Action: action})
		if err != nil {
			t.Fatalf("%s %s %s: %v", user, action, resource, err)
		}
		if decision.Allowed != want {
			t.Errorf("%s %s %s: allowed=%v, want %v", user, action, resource, decision.Allowed, want)
		}
	}
	check("gm", "scene-1", "modify", true)
	check("bob", "scene-1", "modify", false)
	check("bob", "scene-1", "read", true)
	check("bob", "token-1", "modify", true)
	check("carol", "token-1", "read", true)
	check("sam", "token-1", "read", true)
	check("sam", "token-1", "modify", false)
	check("bob", "dice-1", "modify", true)
	check("carol", "dice-1", "modify", false)
}

type vttHarness struct {
	t       *testing.T
	runtime ClientRuntime
	records *memoryRecords
	sent    map[string][]map[string]any
}

func newVTTHarness(t *testing.T) *vttHarness {
	t.Helper()
	definition, err := platform.Load(filepath.Join("..", "..", "server", "easel", "server"))
	if err != nil {
		t.Fatal(err)
	}
	pkg := vttModule(t)
	startup := `const table = Easel.Interfaces.create("easel.vtt.table@1");
table.start({
  actor: (type, id) => id === "hero" ? { name: "Hero", image: "hero.png" } : null,
  initiative: (combatant) => combatant.name === "Hero" ? 18 : 7,
});
Application.events.register("probe.turns", { valid: 1, log: "array" });
const log = [];
Application.events.on("easel.vtt.turnStarted", (event) => log.push("start:" + event.combatantId + ":" + event.round));
Application.events.on("easel.vtt.roundStarted", (event) => log.push("round:" + event.round));
export function handleMessage() { return log; }`
	app := newPackage(t, `{"type":"application","name":"game","owner":"easel","host":"probe","server":{"application":{"entry":"main.mjs","required":{"modules":["easel.vtt.table"],"interfaces":["easel.vtt.table@1"]}}}}`, map[string]string{"main.mjs": startup})
	composed, err := schema.Compose([]manifest.Package{pkg, app})
	if err != nil {
		t.Fatalf("compose: %v", err)
	}
	records := &memoryRecords{schema: composed, rows: map[string]automation.Record{"hero": {Type: "easel.vtt.Actor", ID: "hero", Data: map[string]any{"name": "Hero", "ownerUserIds": []any{"bob"}, "viewerUserIds": []any{}, "controllerUserIds": []any{}}, Version: 1}}}
	roles := map[string]string{"gm": "administrator", "bob": "player", "carol": "player", "dave": "player", "erin": "player", "frank": "player"}
	store := &vttTestStore{memorySecurityStore: memorySecurityStore{relationships: map[security.Relationship]bool{}}, records: records, roles: roles}
	runtime, err := NewGame(context.Background(), Game{
		GameID:    "vtt",
		SessionID: "vtt",
		Packages:  []manifest.Package{app, pkg},
		Globals:   definition.Libraries,
		Records:   records,
		Security:  &jsapi.SecurityConfig{BuildID: "vtt-test", Store: store},
		Members: func(context.Context) (any, error) {
			return []any{
				map[string]any{"id": "gm", "displayName": "GM", "role": "administrator"},
				map[string]any{"id": "bob", "displayName": "Bob", "role": "player"},
				map[string]any{"id": "carol", "displayName": "Carol", "role": "player"},
				map[string]any{"id": "dave", "displayName": "Dave", "role": "player"},
				map[string]any{"id": "erin", "displayName": "Erin", "role": "player"},
				map[string]any{"id": "frank", "displayName": "Frank", "role": "player"},
			}, nil
		},
		AuthorizeClient: func(context.Context, string, json.RawMessage, bool) error { return nil },
	})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	client, ok := runtime.(ClientRuntime)
	if !ok {
		t.Fatal("runtime cannot serve clients")
	}
	t.Cleanup(func() { runtime.Close() })
	return &vttHarness{t: t, runtime: client, records: records, sent: map[string][]map[string]any{}}
}

func (h *vttHarness) emit(user, name string, payload any) string {
	h.t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		h.t.Fatal(err)
	}
	connection := &jsapi.Connection{User: map[string]any{"id": user, "displayName": strings.ToUpper(user[:1]) + user[1:]}, Send: func(event string, body json.RawMessage) error {
		var decoded map[string]any
		if err := json.Unmarshal(body, &decoded); err != nil {
			return err
		}
		h.sent[user+" "+event] = append(h.sent[user+" "+event], decoded)
		return nil
	}}
	ctx := jsapi.WithConnection(security.WithPrincipal(context.Background(), user), connection)
	if err := h.runtime.EmitAuthorizedClient(ctx, "easel.vtt."+name, encoded); err != nil {
		h.t.Fatalf("%s %s: %v", user, name, err)
	}
	if errors := h.sent[user+" easel.vtt.error"]; len(errors) > 0 {
		message := errors[len(errors)-1]["message"]
		delete(h.sent, user+" easel.vtt.error")
		return message.(string)
	}
	return ""
}

func (h *vttHarness) state(user string) map[string]any {
	h.t.Helper()
	if message := h.emit(user, "refresh", map[string]any{}); message != "" {
		h.t.Fatalf("refresh: %s", message)
	}
	states := h.sent[user+" easel.vtt.state"]
	return states[len(states)-1]["state"].(map[string]any)
}

func (h *vttHarness) ids(recordType string) []string {
	out := []string{}
	for id, record := range h.records.rows {
		if record.Type == recordType {
			out = append(out, id)
		}
	}
	return out
}

func (h *vttHarness) must(user, name string, payload any) {
	h.t.Helper()
	if message := h.emit(user, name, payload); message != "" {
		h.t.Fatalf("%s %s: %s", user, name, message)
	}
}

func (h *vttHarness) refuse(user, name string, payload any, want string) {
	h.t.Helper()
	message := h.emit(user, name, payload)
	if !strings.Contains(message, want) {
		h.t.Fatalf("%s %s: got %q, want error containing %q", user, name, message, want)
	}
}

func TestVTTScenesTokensAndDoors(t *testing.T) {
	h := newVTTHarness(t)
	h.refuse("bob", "sceneCreate", map[string]any{"name": "Cave"}, "Only the GM")
	h.must("gm", "sceneCreate", map[string]any{"name": "Cave"})
	scenes := h.ids("easel.vtt.Scene")
	if len(scenes) != 1 {
		t.Fatalf("scenes: %v", scenes)
	}
	sceneID := scenes[0]
	ground := map[string]any{"id": "ground", "type": "ground", "children": []any{
		map[string]any{"id": "wall", "type": "wall", "visible": true, "items": []any{
			map[string]any{"id": "w1", "x1": 100, "y1": 0, "x2": 100, "y2": 400},
			map[string]any{"id": "d1", "kind": "door", "door": true, "open": false, "x1": 300, "y1": 0, "x2": 300, "y2": 400},
			map[string]any{"id": "d2", "kind": "door", "door": true, "locked": true, "x1": 500, "y1": 0, "x2": 500, "y2": 400},
			map[string]any{"id": "s1", "kind": "secretDoor", "x1": 700, "y1": 0, "x2": 700, "y2": 400},
		}},
		map[string]any{"id": "notes", "type": "drawing", "visible": false, "items": []any{map[string]any{"id": "gm-note"}}},
	}}
	h.must("gm", "sceneSaveMap", map[string]any{"sceneId": sceneID, "map": map[string]any{"layers": []any{ground}}})

	h.must("gm", "tokenCreate", map[string]any{"sceneId": sceneID, "groundId": "ground", "actorType": "probe.Actor", "actorId": "hero", "name": "", "x": 200, "y": 200})
	h.must("gm", "tokenCreate", map[string]any{"sceneId": sceneID, "groundId": "ground", "actorType": "", "actorId": "", "name": "Lurker", "x": 400, "y": 200})
	h.refuse("gm", "tokenCreate", map[string]any{"sceneId": sceneID, "groundId": "ground", "actorType": "probe.Actor", "actorId": "ghost", "name": "", "x": 0, "y": 0}, "actor was not found")
	var heroID, lurkerID string
	for _, id := range h.ids("easel.vtt.Token") {
		switch h.records.rows[id].Data["name"] {
		case "Hero":
			heroID = id
		case "Lurker":
			lurkerID = id
		}
	}
	if heroID == "" || lurkerID == "" {
		t.Fatal("tokens were not created")
	}
	if actor := h.records.rows[heroID].Data["actorId"]; actor != "hero" {
		t.Fatalf("hero token actor = %v", actor)
	}
	h.must("gm", "tokenUpdate", map[string]any{"tokenId": lurkerID, "changes": map[string]any{"hidden": true}})

	bobView := h.state("bob")
	active := bobView["activeScene"].(map[string]any)
	if tokens := active["tokens"].([]any); len(tokens) != 1 || tokens[0].(map[string]any)["name"] != "Hero" {
		t.Fatalf("bob should see only the hero: %v", tokens)
	}
	encoded, _ := json.Marshal(active["map"])
	if strings.Contains(string(encoded), "gm-note") || strings.Contains(string(encoded), "secretDoor") {
		t.Fatalf("bob received hidden map content: %s", encoded)
	}
	if gmTokens := h.state("gm")["activeScene"].(map[string]any)["tokens"].([]any); len(gmTokens) != 2 {
		t.Fatalf("gm should see both tokens: %v", gmTokens)
	}

	h.refuse("carol", "tokenMove", map[string]any{"tokenId": heroID, "groundId": "ground", "x": 260, "y": 200}, "do not control")
	h.must("bob", "tokenMove", map[string]any{"tokenId": heroID, "groundId": "ground", "x": 260, "y": 200})
	h.refuse("bob", "tokenMove", map[string]any{"tokenId": heroID, "groundId": "ground", "x": 360, "y": 200}, "blocked")
	h.must("bob", "doorToggle", map[string]any{"sceneId": sceneID, "wallId": "d1", "open": true})
	h.must("bob", "tokenMove", map[string]any{"tokenId": heroID, "groundId": "ground", "x": 360, "y": 200})
	h.refuse("bob", "doorToggle", map[string]any{"sceneId": sceneID, "wallId": "d2", "open": true}, "locked")
	h.refuse("bob", "doorToggle", map[string]any{"sceneId": sceneID, "wallId": "s1", "open": true}, "That is not a door")
	h.refuse("bob", "doorToggle", map[string]any{"sceneId": sceneID, "wallId": "w1", "open": true}, "not a door")
	h.must("gm", "tokenMove", map[string]any{"tokenId": lurkerID, "groundId": "ground", "x": 50, "y": 200})
	h.refuse("bob", "tokenUpdate", map[string]any{"tokenId": heroID, "changes": map[string]any{"hidden": true}}, "cannot change")
}

func TestVTTCombatTurnOrder(t *testing.T) {
	h := newVTTHarness(t)
	h.must("gm", "sceneCreate", map[string]any{"name": "Arena"})
	sceneID := h.ids("easel.vtt.Scene")[0]
	for _, name := range []string{"Hero", "Goblin", "Orc"} {
		actorID := ""
		if name == "Hero" {
			actorID = "hero"
		}
		h.must("gm", "tokenCreate", map[string]any{"sceneId": sceneID, "groundId": "", "actorType": "probe.Actor", "actorId": actorID, "name": name, "x": 0, "y": 0})
	}
	h.must("gm", "combatStart", map[string]any{"sceneId": sceneID})
	h.refuse("gm", "combatStart", map[string]any{"sceneId": sceneID}, "already running")
	combatID := h.ids("easel.vtt.Combat")[0]
	tokens := map[string]string{}
	for _, id := range h.ids("easel.vtt.Token") {
		tokens[h.records.rows[id].Data["name"].(string)] = id
	}
	for _, name := range []string{"Hero", "Goblin", "Orc"} {
		h.must("gm", "combatantAdd", map[string]any{"combatId": combatID, "tokenId": tokens[name]})
	}
	h.refuse("gm", "combatantAdd", map[string]any{"combatId": combatID, "tokenId": tokens["Orc"]}, "already in the combat")
	combatants := map[string]string{}
	for _, id := range h.ids("easel.vtt.Combatant") {
		combatants[h.records.rows[id].Data["name"].(string)] = id
	}
	h.refuse("carol", "combatantRollInitiative", map[string]any{"combatantId": combatants["Hero"]}, "do not control")
	h.must("bob", "combatantRollInitiative", map[string]any{"combatantId": combatants["Hero"]})
	h.must("gm", "combatantSetInitiative", map[string]any{"combatantId": combatants["Orc"], "initiative": 12})
	h.must("gm", "combatantRollInitiative", map[string]any{"combatantId": combatants["Goblin"]})
	h.refuse("bob", "combatNext", map[string]any{"combatId": combatID}, "Only the GM")

	h.must("gm", "combatNext", map[string]any{"combatId": combatID})
	h.must("gm", "combatantDefeated", map[string]any{"combatantId": combatants["Orc"], "defeated": true})
	h.must("gm", "combatNext", map[string]any{"combatId": combatID})
	h.must("gm", "combatNext", map[string]any{"combatId": combatID})
	view := h.state("gm")["combat"].(map[string]any)
	if view["round"].(float64) != 2 || view["currentId"] != combatants["Hero"] {
		t.Fatalf("expected round 2 back on the hero: %v", view)
	}
	order := []string{}
	for _, entry := range view["combatants"].([]any) {
		order = append(order, entry.(map[string]any)["name"].(string))
	}
	if strings.Join(order, ",") != "Hero,Orc,Goblin" {
		t.Fatalf("order = %v", order)
	}
	h.must("gm", "combatPrevious", map[string]any{"combatId": combatID})
	if current := h.state("gm")["combat"].(map[string]any)["currentId"]; current != combatants["Goblin"] {
		t.Fatalf("previous should return to the goblin, got %v", current)
	}
	log, err := h.runtime.Dispatch(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	want := `["round:1","start:` + combatants["Hero"] + `:1","start:` + combatants["Goblin"] + `:1","round:2","start:` + combatants["Hero"] + `:2","start:` + combatants["Goblin"] + `:1"]`
	if string(log) != want {
		t.Fatalf("turn events:\n got %s\nwant %s", log, want)
	}
}

func TestVTTChatRollModes(t *testing.T) {
	h := newVTTHarness(t)
	h.must("bob", "chatSend", map[string]any{"text": "hello all", "rollMode": "public", "whisperUserIds": []any{}})
	h.must("bob", "chatSend", map[string]any{"text": "for the gm", "rollMode": "gm", "whisperUserIds": []any{}})
	h.must("bob", "chatSend", map[string]any{"text": "blind", "rollMode": "blind", "whisperUserIds": []any{}})
	h.must("bob", "chatSend", map[string]any{"text": "just me", "rollMode": "self", "whisperUserIds": []any{}})
	h.must("bob", "chatSend", map[string]any{"text": "psst carol", "rollMode": "public", "whisperUserIds": []any{"carol"}})
	h.refuse("bob", "chatSend", map[string]any{"text": "x", "rollMode": "loud", "whisperUserIds": []any{}}, "Unknown roll mode")
	h.refuse("bob", "chatSend", map[string]any{"text": "   ", "rollMode": "public", "whisperUserIds": []any{}}, "between 1 and 4000")
	texts := func(user string) string {
		out := []string{}
		for _, message := range h.state(user)["messages"].([]any) {
			entry := message.(map[string]any)
			if entry["concealed"] == true {
				out = append(out, "<concealed>")
				continue
			}
			out = append(out, entry["text"].(string))
		}
		return strings.Join(out, "|")
	}
	cases := map[string]string{
		"gm":    "hello all|for the gm|blind|psst carol",
		"bob":   "hello all|for the gm|<concealed>|just me|psst carol",
		"carol": "hello all|psst carol",
	}
	for user, want := range cases {
		if got := texts(user); got != want {
			t.Errorf("%s sees %q, want %q", user, got, want)
		}
	}
	h.must("bob", "diceSave", map[string]any{"settings": map[string]any{"theme": "bronze"}})
	if theme := h.state("bob")["diceSettings"].(map[string]any)["theme"]; theme != "bronze" {
		t.Fatalf("dice theme = %v", theme)
	}
	if settings := h.state("carol")["diceSettings"].(map[string]any); len(settings) != 0 {
		t.Fatalf("carol should not see bob's dice settings: %v", settings)
	}
}
