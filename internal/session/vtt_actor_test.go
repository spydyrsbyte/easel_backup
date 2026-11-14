package session

import (
	"context"
	"testing"

	"easel/internal/automation"
	"easel/internal/jsapi"
	"easel/internal/manifest"
	"easel/internal/schema"
	"easel/internal/security"
)

func TestVTTActorInheritedPolicies(t *testing.T) {
	vtt := vttModule(t)
	derived := newPackage(t, `{"type":"application","owner":"easel","host":"probe","name":"actors","server":{"application":{"entry":"main.mjs"},"data":[{".name":"Character",".extends":"easel.vtt.Actor","hp":{".type":"integer",".default":10}}]}}`, map[string]string{"main.mjs": ""})
	composed, err := schema.Compose([]manifest.Package{vtt, derived})
	if err != nil {
		t.Fatal(err)
	}
	if !composed.IsA("easel.probe.Character", "easel.vtt.Actor") || composed.Types["easel.probe.Character"].Fields["ownerUserIds"].Owner != "easel.vtt.table" {
		t.Fatal("the game actor must inherit the VTT record and field ownership")
	}
	records := &memoryRecords{schema: composed, rows: map[string]automation.Record{
		"actor": {Type: "easel.probe.Character", ID: "actor", Data: map[string]any{"ownerUserIds": []any{"owner"}}},
	}}
	store := &vttTestStore{memorySecurityStore: memorySecurityStore{relationships: map[security.Relationship]bool{}}, records: records, roles: map[string]string{"gm": "administrator", "player": "player", "spectator": "spectator"}}
	service, err := jsapi.BuildSecurity(context.Background(), &jsapi.SecurityConfig{BuildID: "actor-inheritance", Store: store}, "", []manifest.Entry{{Package: vtt, Path: "server/security.mjs"}}, composed)
	if err != nil {
		t.Fatal(err)
	}
	for user, actions := range map[string]map[string]bool{
		"gm":        {"read": true, "modify": true, "manage": true},
		"player":    {"read": true, "modify": true, "manage": false},
		"spectator": {"read": true, "modify": false, "manage": false},
	} {
		for action, allowed := range actions {
			decision, err := service.Authorize(security.WithPrincipal(context.Background(), user), security.AuthorizationRequest{ResourceID: "actor", Action: action})
			if err != nil || decision.Allowed != allowed {
				t.Errorf("%s %s inherited actor: allowed=%v want=%v err=%v", user, action, decision.Allowed, allowed, err)
			}
		}
	}
}

func TestVTTActorRoles(t *testing.T) {
	h := newVTTHarness(t)
	h.must("gm", "sceneCreate", map[string]any{"name": "Roles"})
	sceneID := h.ids("easel.vtt.Scene")[0]
	h.must("bob", "actorDefaultToken", map[string]any{"actorId": "hero", "settings": map[string]any{"name": "Default Hero", "width": 96, "height": 96, "rotation": 45}})
	prototypeID := h.records.rows["hero"].Data["defaultTokenId"].(string)
	if prototype := h.records.rows[prototypeID]; prototype.Data["isDefault"] != true || prototype.Data["sceneId"] != nil {
		t.Fatalf("default token must be an unplaced template: %v", prototype.Data)
	}
	h.must("gm", "tokenCreate", map[string]any{"sceneId": sceneID, "groundId": "ground", "actorType": "easel.vtt.Actor", "actorId": "hero", "name": "", "x": 200, "y": 200})
	var tokenID string
	for _, id := range h.ids("easel.vtt.Token") {
		if id != prototypeID {
			tokenID = id
		}
	}
	if placed := h.records.rows[tokenID].Data; placed["width"] != h.records.rows[prototypeID].Data["width"] || placed["name"] != "Default Hero" {
		t.Fatalf("placed token did not copy its default: %v", placed)
	}

	h.refuse("carol", "actorPermissions", map[string]any{"actorId": "hero", "ownerUserIds": []any{"carol"}, "viewerUserIds": []any{}, "controllerUserIds": []any{}}, "Only an owner")
	h.refuse("bob", "actorPermissions", map[string]any{"actorId": "hero", "ownerUserIds": []any{"bob", "nobody"}, "viewerUserIds": []any{}, "controllerUserIds": []any{}}, "game members")
	h.must("bob", "actorPermissions", map[string]any{"actorId": "hero", "ownerUserIds": []any{"bob", "dave"}, "viewerUserIds": []any{"erin"}, "controllerUserIds": []any{"carol"}})

	x := 220.0
	for _, user := range []string{"bob", "dave", "carol", "gm"} {
		h.must(user, "tokenMove", map[string]any{"tokenId": tokenID, "groundId": "ground", "x": x, "y": 200})
		x += 10
	}
	h.refuse("erin", "tokenMove", map[string]any{"tokenId": tokenID, "groundId": "ground", "x": x, "y": 200}, "do not control")
	h.refuse("frank", "tokenMove", map[string]any{"tokenId": tokenID, "groundId": "ground", "x": x, "y": 200}, "do not control")
	if h.records.rows[prototypeID].Data["x"] == h.records.rows[tokenID].Data["x"] {
		t.Fatal("moving a placed token modified its template")
	}

	h.must("dave", "actorDefaultToken", map[string]any{"actorId": "hero", "settings": map[string]any{"width": 128}})
	h.refuse("carol", "actorDefaultToken", map[string]any{"actorId": "hero", "settings": map[string]any{"width": 64}}, "Only an owner")
	h.refuse("erin", "actorDefaultToken", map[string]any{"actorId": "hero", "settings": map[string]any{"width": 64}}, "Only an owner")

	view := func(user string) map[string]any {
		for _, entry := range h.state(user)["actors"].([]any) {
			if actor := entry.(map[string]any); actor["id"] == "hero" {
				return actor
			}
		}
		return nil
	}
	if view("frank") != nil {
		t.Fatal("a player with no role must not receive the actor")
	}
	if erin := view("erin"); erin == nil || erin["canControl"] != false || erin["ownerUserIds"] != nil {
		t.Fatalf("a viewer reads the actor without control or the role lists: %v", erin)
	}
	if carol := view("carol"); carol == nil || carol["canControl"] != true || carol["canWrite"] != false {
		t.Fatalf("a controller reads and controls without writing: %v", carol)
	}
	if dave := view("dave"); dave == nil || dave["canWrite"] != true || len(dave["ownerUserIds"].([]any)) != 2 {
		t.Fatalf("an owner writes and sees every owner: %v", dave)
	}
	tokens := func(user string) map[string]any {
		return h.state(user)["activeScene"].(map[string]any)["tokens"].([]any)[0].(map[string]any)
	}
	if tokens("erin")["canControl"] != false || tokens("carol")["canControl"] != true || tokens("bob")["canControl"] != true {
		t.Fatal("token control flags do not follow the actor's roles")
	}
}
