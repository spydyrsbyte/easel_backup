package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"easel/internal/accounts"
	"easel/internal/database/dbtest"
	"easel/internal/games"
	"easel/internal/jsapi"
	"easel/internal/security"
)

type pathfinderTable struct {
	t       *testing.T
	ctx     context.Context
	manager *games.Manager
	gameID  string
}

func (p *pathfinderTable) request(user accounts.User, event string, payload map[string]any) map[string]map[string]any {
	p.t.Helper()
	runtime, ok := p.manager.Runtime(p.gameID)
	if !ok {
		p.t.Fatal("game is not running")
	}
	replies := map[string]map[string]any{}
	connection := &jsapi.Connection{User: map[string]any{"id": user.ID, "displayName": user.DisplayName}, Send: func(name string, data json.RawMessage) error {
		reply := map[string]any{}
		if err := json.Unmarshal(data, &reply); err != nil {
			return err
		}
		replies[name] = reply
		return nil
	}}
	data, _ := json.Marshal(payload)
	if err := runtime.EmitAuthorizedClient(jsapi.WithConnection(security.WithPrincipal(p.ctx, user.ID), connection), event, data); err != nil {
		p.t.Fatalf("%s: %v", event, err)
	}
	return replies
}

func (p *pathfinderTable) ok(user accounts.User, event string, payload map[string]any) map[string]map[string]any {
	p.t.Helper()
	replies := p.request(user, event, payload)
	for _, name := range []string{"easel.pf1e.error", "easel.vtt.error"} {
		if failure, found := replies[name]; found {
			p.t.Fatalf("%s failed: %v", event, failure["message"])
		}
	}
	return replies
}

func (p *pathfinderTable) refused(user accounts.User, event string, payload map[string]any, want string) {
	p.t.Helper()
	replies := p.request(user, event, payload)
	failure := replies["easel.pf1e.error"]
	if failure == nil {
		failure = replies["easel.vtt.error"]
	}
	if failure == nil || !strings.Contains(failure["message"].(string), want) {
		p.t.Fatalf("%s should be refused with %q, got %v", event, want, failure)
	}
}

func (p *pathfinderTable) actors(user accounts.User) map[string]map[string]any {
	p.t.Helper()
	found := map[string]map[string]any{}
	for _, entry := range p.ok(user, "easel.pf1e.refresh", map[string]any{})["easel.pf1e.state"]["actors"].([]any) {
		actor := entry.(map[string]any)
		found[actor["name"].(string)] = actor
	}
	return found
}

func (p *pathfinderTable) sheet(user accounts.User, id string) (map[string]any, map[string]any) {
	p.t.Helper()
	sheet := p.ok(user, "easel.pf1e.open", map[string]any{"actorId": id})["easel.pf1e.sheet"]["sheet"].(map[string]any)
	return sheet["doc"].(map[string]any), sheet["derived"].(map[string]any)
}

func (p *pathfinderTable) vtt(user accounts.User) map[string]any {
	p.t.Helper()
	return p.ok(user, "easel.vtt.refresh", map[string]any{})["easel.vtt.state"]["state"].(map[string]any)
}

func (p *pathfinderTable) lastCard(user accounts.User) map[string]any {
	p.t.Helper()
	messages := p.vtt(user)["messages"].([]any)
	if len(messages) == 0 {
		p.t.Fatal("no chat messages")
	}
	return messages[len(messages)-1].(map[string]any)["card"].(map[string]any)
}

func at(value any, path ...string) any {
	for _, key := range path {
		value = value.(map[string]any)[key]
	}
	return value
}

func first(value any) map[string]any {
	return value.([]any)[0].(map[string]any)
}

func pathfinderGame(t *testing.T, manager *games.Manager, ctx context.Context, owner accounts.User, name string, modules ...string) *pathfinderTable {
	t.Helper()
	game, err := manager.Create(security.WithPrincipal(ctx, owner.ID), name, "easel.pf1e.game", append([]string{"easel.vtt.table", "easel.wotcogl35.rules"}, modules...), games.Open)
	if err != nil {
		t.Fatal(err)
	}
	return &pathfinderTable{t: t, ctx: ctx, manager: manager, gameID: game.ID}
}

func TestPathfinderGame(t *testing.T) {
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	service := &accounts.Service{Pool: pool}
	ctx := context.Background()
	gm, err := service.SignUp(ctx, "gamemaster", "correct horse", "Game Master")
	if err != nil {
		t.Fatal(err)
	}
	player, err := service.SignUp(ctx, "player", "correct horse", "Player")
	if err != nil {
		t.Fatal(err)
	}
	table := pathfinderGame(t, manager, ctx, gm, "Pathfinder night")
	if err := manager.Join(ctx, table.gameID, player); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, table.gameID); err != nil {
		t.Fatal(err)
	}

	state := table.ok(gm, "easel.pf1e.refresh", map[string]any{})["easel.pf1e.state"]
	if at(state["system"], "id") != "pf1e" || len(at(state["system"], "classes").([]any)) < 11 || len(at(state["system"], "kinds").([]any)) != 7 {
		t.Fatal("system information is missing", state["system"])
	}
	all := table.actors(gm)
	for _, name := range []string{"Aldric", "Mira", "Pip", "Cellar Rat", "Cellar Rat 2", "The Collector"} {
		if all[name] == nil {
			t.Fatalf("starting table has no %s: %v", name, all)
		}
	}
	if len(table.actors(player)) != 0 {
		t.Fatal("a player sees characters nobody gave them")
	}
	aldric := all["Aldric"]["id"].(string)
	mira := all["Mira"]["id"].(string)
	rat := all["Cellar Rat"]["id"].(string)
	table.refused(player, "easel.pf1e.open", map[string]any{"actorId": aldric}, "cannot open")
	table.refused(player, "easel.pf1e.actorUpdate", map[string]any{"actorId": aldric, "changes": map[string]any{"ownerUserIds": []string{player.ID}}}, "Only an owner")
	for _, id := range []string{aldric, mira} {
		table.ok(gm, "easel.pf1e.actorUpdate", map[string]any{"actorId": id, "changes": map[string]any{"ownerUserIds": []string{player.ID}}})
	}
	if seen := table.actors(player); len(seen) != 2 || seen["Aldric"]["summary"] != "Human Fighter 2" {
		t.Fatal("the player should now see two characters", seen)
	}

	_, sheet := table.sheet(player, aldric)
	if at(sheet, "ac", "total") != float64(19) || at(sheet, "hp", "max") != float64(23) || sheet["bab"] != float64(2) {
		t.Fatal("Aldric's statistics are wrong", sheet["ac"], sheet["hp"])
	}
	sword := first(sheet["attacks"])
	if sword["name"] != "Longsword" || sword["bonuses"].([]any)[0] != float64(7) || first(sword["damage"])["formula"] != "1d8+4" {
		t.Fatal("Aldric's longsword is wrong", sword)
	}
	table.ok(player, "easel.pf1e.actorAction", map[string]any{"actorId": aldric, "action": "toggle", "data": map[string]any{"id": "powerAttack", "on": true}})
	_, sheet = table.sheet(player, aldric)
	sword = first(sheet["attacks"])
	if sword["bonuses"].([]any)[0] != float64(6) || first(sword["damage"])["formula"] != "1d8+6" {
		t.Fatal("power attack did not apply", sword)
	}

	table.ok(player, "easel.pf1e.roll", map[string]any{"actorId": aldric, "kind": "attack", "id": sword["id"], "options": map[string]any{"rollMode": "public"}})
	card := table.lastCard(gm)
	if card["title"] != "Longsword" || len(card["sections"].([]any)) < 1 {
		t.Fatal("the attack did not reach chat", card)
	}
	table.ok(player, "easel.pf1e.roll", map[string]any{"actorId": aldric, "kind": "save", "id": "will", "options": map[string]any{"dc": 15}})
	if card = table.lastCard(player); card["title"] != "Will save" {
		t.Fatal("the save did not reach chat", card)
	}
	table.ok(player, "easel.pf1e.roll", map[string]any{"actorId": aldric, "kind": "skill", "id": "clm", "options": map[string]any{}})
	table.refused(player, "easel.pf1e.roll", map[string]any{"actorId": aldric, "kind": "skill", "id": "dev", "options": map[string]any{}}, "untrained")
	table.refused(player, "easel.pf1e.roll", map[string]any{"actorId": aldric, "kind": "nonsense", "id": "", "options": map[string]any{}}, "no nonsense roll")
	table.refused(player, "easel.pf1e.roll", map[string]any{"actorId": rat, "kind": "attack", "id": "stat:0", "options": map[string]any{}}, "do not control")

	table.ok(player, "easel.pf1e.apply", map[string]any{"targets": []string{aldric}, "payload": map[string]any{"amount": 9, "type": "S"}})
	if _, sheet = table.sheet(player, aldric); at(sheet, "hp", "current") != float64(14) {
		t.Fatal("damage was not applied", sheet["hp"])
	}
	table.ok(player, "easel.pf1e.apply", map[string]any{"targets": []string{aldric}, "payload": map[string]any{"amount": 4, "healing": true}})
	table.refused(player, "easel.pf1e.apply", map[string]any{"targets": []string{rat}, "payload": map[string]any{"amount": 50}}, "Select the tokens")
	table.ok(gm, "easel.pf1e.apply", map[string]any{"targets": []string{rat}, "payload": map[string]any{"amount": 50}})
	if status := table.actors(gm)["Cellar Rat"]["status"]; status != "dead" {
		t.Fatal("the rat should be dead", status)
	}

	_, sheet = table.sheet(player, mira)
	caster := first(sheet["casting"])
	prepared := caster["prepared"].([]any)
	if caster["casterLevel"] != float64(2) || caster["system"] != "vancian" || len(prepared) != 7 {
		t.Fatal("Mira's spells are wrong", caster)
	}
	var missile, slot map[string]any
	for _, entry := range caster["spells"].([]any) {
		if spell := entry.(map[string]any); spell["name"] == "Magic Missile" {
			missile = spell
		}
	}
	for _, entry := range prepared {
		if spell := entry.(map[string]any); spell["name"] == "Magic Missile" && slot == nil {
			slot = spell
		}
	}
	cast := map[string]any{"actorId": mira, "kind": "spell", "id": missile["uid"], "options": map[string]any{"key": "wizard", "prepared": slot["uid"]}}
	table.ok(player, "easel.pf1e.roll", cast)
	if card = table.lastCard(player); card["title"] != "Magic Missile" || len(card["actions"].([]any)) == 0 {
		t.Fatal("the spell did not reach chat with a damage button", card)
	}
	table.refused(player, "easel.pf1e.roll", cast, "already been cast")
	table.ok(player, "easel.pf1e.actorAction", map[string]any{"actorId": mira, "action": "rest", "data": map[string]any{}})
	table.ok(player, "easel.pf1e.roll", cast)
	table.ok(player, "easel.pf1e.actorAdd", map[string]any{"actorId": mira, "entryId": "class:wizard", "options": map[string]any{}})
	table.ok(player, "easel.pf1e.actorAdd", map[string]any{"actorId": mira, "entryId": "spell:fireball", "options": map[string]any{"key": "wizard"}})
	table.ok(player, "easel.pf1e.actorAdd", map[string]any{"actorId": mira, "entryId": "item:ring-of-protection-1", "options": map[string]any{}})
	table.refused(player, "easel.pf1e.actorAdd", map[string]any{"actorId": mira, "entryId": "feat:weapon-focus", "options": map[string]any{}}, "needs a choice")
	table.refused(player, "easel.pf1e.actorAdd", map[string]any{"actorId": mira, "entryId": "monster:goblin", "options": map[string]any{}}, "cannot be added")
	table.ok(player, "easel.pf1e.actorAdd", map[string]any{"actorId": mira, "entryId": "feat:skill-focus", "options": map[string]any{"choice": "spl"}})
	doc, sheet := table.sheet(player, mira)
	if sheet["level"] != float64(3) || at(sheet, "skills", "spl", "total") != float64(4+2+3+3) {
		t.Fatal("Mira did not gain a level and Skill Focus", sheet["level"], at(sheet, "skills", "spl"))
	}
	items := doc["items"].([]any)
	ring := items[len(items)-1].(map[string]any)
	before := at(sheet, "ac", "total").(float64)
	table.ok(player, "easel.pf1e.actorItem", map[string]any{"actorId": mira, "uid": ring["uid"], "changes": map[string]any{"equipped": true}})
	table.ok(player, "easel.pf1e.actorUpdate", map[string]any{"actorId": mira, "changes": map[string]any{"set": map[string]any{"abilities.dex.base": 16, "notes": "Keeps a tidy spellbook."}}})
	table.refused(player, "easel.pf1e.actorUpdate", map[string]any{"actorId": mira, "changes": map[string]any{"set": map[string]any{"statblock.cr": 30}}}, "no field")
	if _, sheet = table.sheet(player, mira); at(sheet, "ac", "total") != before+2 {
		t.Fatal("the ring and the Dexterity change did not raise AC", before, sheet["ac"])
	}

	scene := table.vtt(gm)["activeScene"].(map[string]any)
	table.refused(player, "easel.pf1e.spawn", map[string]any{"entryId": "monster:goblin", "sceneId": scene["id"], "groundId": "", "x": 500, "y": 500}, "Only the GM")
	table.ok(gm, "easel.pf1e.spawn", map[string]any{"entryId": "monster:ogre", "sceneId": scene["id"], "groundId": "", "x": 500, "y": 500})
	ogre := table.actors(gm)["Ogre"]
	if ogre == nil || ogre["summary"] != "CR 3 · humanoid (giant)" {
		t.Fatal("the ogre was not placed", ogre)
	}
	scene = table.vtt(gm)["activeScene"].(map[string]any)
	var ogreToken, aldricToken map[string]any
	for _, entry := range scene["tokens"].([]any) {
		token := entry.(map[string]any)
		if token["actorId"] == ogre["id"] {
			ogreToken = token
		}
		if token["actorId"] == aldric {
			aldricToken = token
		}
	}
	if ogreToken == nil || ogreToken["width"] != float64(200) {
		t.Fatal("a Large creature should take a two-square token", ogreToken)
	}
	table.ok(gm, "easel.pf1e.effect", map[string]any{"targets": []any{ogreToken["id"]}, "entryId": "buff:haste", "level": 5, "rounds": 5})
	if _, sheet = table.sheet(gm, ogre["id"].(string)); at(sheet, "ac", "total") != float64(18) || at(sheet, "speed", "land") != float64(60) {
		t.Fatal("haste did not apply to the ogre", sheet["ac"], sheet["speed"])
	}
	table.ok(gm, "easel.vtt.tokenDelete", map[string]any{"tokenId": ogreToken["id"]})
	if table.actors(gm)["Ogre"] != nil {
		t.Fatal("removing a placed monster's token should remove the monster")
	}

	if entries := table.ok(player, "easel.pf1e.library", map[string]any{"kind": "spell"})["easel.pf1e.entries"]["entries"].([]any); len(entries) < 190 {
		t.Fatal("the spell library is short", len(entries))
	}
	block := "Cave Lurker CR 2\nXP 600\nNE Medium aberration\nInit +2; Senses darkvision 60 ft.; Perception +6\nDEFENSE\nAC 15, touch 12, flat-footed 13 (+2 Dex, +3 natural)\nhp 22 (3d8+9)\nFort +4, Ref +3, Will +4\nOFFENSE\nSpeed 30 ft., climb 20 ft.\nMelee 2 claws +5 (1d6+3 plus grab)\nSTATISTICS\nStr 16, Dex 15, Con 16, Int 5, Wis 12, Cha 8\nBase Atk +2; CMB +5; CMD 17\nSkills Perception +6, Stealth +10"
	table.refused(player, "easel.pf1e.entrySave", map[string]any{"entry": map[string]any{"kind": "monster", "text": block}}, "Only the GM")
	table.refused(gm, "easel.pf1e.entrySave", map[string]any{"entry": map[string]any{"kind": "monster", "text": "nothing useful"}}, "stat block")
	table.refused(gm, "easel.pf1e.entrySave", map[string]any{"entry": map[string]any{"kind": "class", "name": "Made up"}}, "content module")
	saved := table.ok(gm, "easel.pf1e.entrySave", map[string]any{"entry": map[string]any{"kind": "monster", "text": block}})["easel.pf1e.entry"]["entry"].(map[string]any)
	if saved["id"] != "monster:cave-lurker" || saved["pack"] != "custom" {
		t.Fatal("the imported monster was not saved", saved)
	}
	table.ok(gm, "easel.pf1e.entrySave", map[string]any{"entry": map[string]any{"kind": "item", "name": "Flame Tongue", "type": "weapon", "category": "martial", "handed": "one", "damage": "1d8", "critRange": 19, "critMult": 2, "price": 20715, "weight": 4, "description": "A blade wreathed in fire."}})
	table.ok(gm, "easel.pf1e.entrySave", map[string]any{"entry": map[string]any{"kind": "buff", "name": "Battle Hymn", "description": "A house effect.", "changes": []map[string]any{{"target": "attack", "type": "morale", "value": "2"}}}})
	table.ok(gm, "easel.pf1e.actorAdd", map[string]any{"actorId": aldric, "entryId": "buff:battle-hymn", "options": map[string]any{}})
	if _, sheet = table.sheet(gm, aldric); first(sheet["attacks"])["bonuses"].([]any)[0] != float64(8) {
		t.Fatal("the custom effect did not apply", first(sheet["attacks"]))
	}

	table.ok(gm, "easel.pf1e.effect", map[string]any{"targets": []any{aldricToken["id"]}, "entryId": "buff:bless", "level": 1, "rounds": 1})
	table.ok(gm, "easel.vtt.combatStart", map[string]any{"sceneId": scene["id"]})
	combat := table.vtt(gm)["combat"].(map[string]any)["id"]
	table.ok(gm, "easel.vtt.combatantAdd", map[string]any{"combatId": combat, "tokenId": aldricToken["id"]})
	combatant := first(table.vtt(gm)["combat"].(map[string]any)["combatants"])
	table.ok(player, "easel.vtt.combatantRollInitiative", map[string]any{"combatantId": combatant["id"]})
	if card = table.lastCard(player); card["title"] != "Initiative" {
		t.Fatal("initiative was not rolled from the sheet", card)
	}
	if rolled := first(table.vtt(gm)["combat"].(map[string]any)["combatants"]); rolled["hasInitiative"] != true {
		t.Fatal("the initiative roll did not reach the encounter", rolled)
	}
	table.ok(gm, "easel.vtt.combatNext", map[string]any{"combatId": combat})
	doc, _ = table.sheet(player, aldric)
	for _, entry := range doc["buffs"].([]any) {
		if buff := entry.(map[string]any); buff["name"] == "Bless" && buff["active"] == true {
			t.Fatal("a one-round effect should end when the creature's turn starts", doc["buffs"])
		}
	}
	table.ok(gm, "easel.vtt.combatEnd", map[string]any{"combatId": combat})

	if err := manager.Stop(table.gameID); err != nil {
		t.Fatal(err)
	}
	if err := manager.Start(ctx, table.gameID); err != nil {
		t.Fatal(err)
	}
	if _, sheet = table.sheet(player, mira); sheet["level"] != float64(3) {
		t.Fatal("restart lost the character", sheet["level"])
	}
	entry := table.ok(player, "easel.pf1e.lookup", map[string]any{"id": "monster:cave-lurker"})["easel.pf1e.entry"]["entry"].(map[string]any)
	if at(entry, "statblock", "hp", "max") != float64(22) {
		t.Fatal("restart lost the imported monster", entry)
	}
	table.ok(gm, "easel.pf1e.entryDelete", map[string]any{"id": "monster:cave-lurker"})
	table.refused(gm, "easel.pf1e.entryDelete", map[string]any{"id": "monster:goblin"}, "Only entries made at this table")
	table.refused(player, "easel.pf1e.lookup", map[string]any{"id": "monster:cave-lurker"}, "no entry")
	table.refused(gm, "easel.pf1e.lookup", map[string]any{"id": "item:healing-salve"}, "no entry")
}

func TestPathfinderExtensions(t *testing.T) {
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	service := &accounts.Service{Pool: pool}
	ctx := context.Background()
	gm, err := service.SignUp(ctx, "gamemaster", "correct horse", "Game Master")
	if err != nil {
		t.Fatal(err)
	}
	table := pathfinderGame(t, manager, ctx, gm, "House rules", "easel.pf1ehomebrew.example")
	if err := manager.Start(ctx, table.gameID); err != nil {
		t.Fatal(err)
	}
	system := table.ok(gm, "easel.pf1e.refresh", map[string]any{})["easel.pf1e.state"]["system"].(map[string]any)
	if rules := system["extensions"].([]any); len(rules) != 1 || rules[0] != "Example house rules" {
		t.Fatal("the house rules module was not installed", system["extensions"])
	}
	if at(system, "skills", "sai", "name") != "Sailing" || at(system, "conditions", "inspired", "name") != "Inspired" || at(system, "options", "hitPoints") != "max" {
		t.Fatal("the house rules did not change the system tables", system["options"])
	}
	hero := table.actors(gm)["Aldric"]["id"].(string)
	_, sheet := table.sheet(gm, hero)
	if at(sheet, "hp", "max") != float64(27) {
		t.Fatal("house rule: every hit die is maximized", sheet["hp"])
	}
	table.ok(gm, "easel.pf1e.actorAdd", map[string]any{"actorId": hero, "entryId": "feat:sea-legs", "options": map[string]any{}})
	table.ok(gm, "easel.pf1e.actorAction", map[string]any{"actorId": hero, "action": "condition", "data": map[string]any{"id": "inspired", "on": true}})
	if _, sheet = table.sheet(gm, hero); at(sheet, "skills", "sai", "total") != float64(1+2+1) {
		t.Fatal("house content and conditions did not apply", at(sheet, "skills", "sai"))
	}
	if salve := table.ok(gm, "easel.pf1e.lookup", map[string]any{"id": "item:healing-salve"})["easel.pf1e.entry"]["entry"].(map[string]any); salve["source"] != "House rules" {
		t.Fatal("house content is missing from the library", salve)
	}

	both := pathfinderGame(t, manager, ctx, gm, "Kineticist", "easel.pf1ehomebrew.example", "easel.pf1ekineticist.rules")
	if err := manager.Start(ctx, both.gameID); err != nil {
		t.Fatal(err)
	}
	system = both.ok(gm, "easel.pf1e.refresh", map[string]any{})["easel.pf1e.state"]["system"].(map[string]any)
	if len(system["extensions"].([]any)) != 2 || len(system["kinds"].([]any)) != 8 || at(system, "skills", "sai", "name") != "Sailing" {
		t.Fatal("two extensions should both be installed", system["extensions"], len(system["kinds"].([]any)))
	}
	both.ok(gm, "easel.pf1e.actorCreate", map[string]any{"name": "Ember", "kind": "character", "entryId": ""})
	ember := both.actors(gm)["Ember"]["id"].(string)
	both.ok(gm, "easel.pf1e.actorUpdate", map[string]any{"actorId": ember, "changes": map[string]any{"set": map[string]any{"abilities.con.base": 16, "abilities.dex.base": 14}}})
	for level := 0; level < 3; level++ {
		both.ok(gm, "easel.pf1e.actorAdd", map[string]any{"actorId": ember, "entryId": "class:kineticist", "options": map[string]any{}})
	}
	for _, talent := range []string{"talent:fire-blast", "talent:extended-range", "talent:kinetic-healer"} {
		both.ok(gm, "easel.pf1e.actorAdd", map[string]any{"actorId": ember, "entryId": talent, "options": map[string]any{}})
	}
	both.refused(gm, "easel.pf1e.actorAdd", map[string]any{"actorId": ember, "entryId": "talent:fire-blast", "options": map[string]any{}}, "already on the sheet")
	opened := both.ok(gm, "easel.pf1e.open", map[string]any{"actorId": ember})["easel.pf1e.sheet"]["sheet"].(map[string]any)
	if len(opened["sections"].([]any)) != 7 {
		t.Fatal("the kineticist's sheet sections are missing", opened["sections"])
	}
	doc, sheet := both.sheet(gm, ember)
	if at(sheet, "resources", "burn", "max") != float64(6) {
		t.Fatal("burn should allow 3 + Constitution modifier", sheet["resources"])
	}
	var blast map[string]any
	for _, entry := range sheet["attacks"].([]any) {
		if attack := entry.(map[string]any); attack["name"] == "Fire Blast" {
			blast = attack
		}
	}
	if blast == nil || blast["touch"] != true || first(blast["damage"])["formula"] != "2d6+1" {
		t.Fatal("the kinetic blast is wrong", blast)
	}
	talents := at(doc, "lists", "talent").([]any)
	both.ok(gm, "easel.pf1e.roll", map[string]any{"actorId": ember, "kind": "use", "id": "talent/" + talents[1].(map[string]any)["uid"].(string), "options": map[string]any{}})
	if card := both.lastCard(gm); card["title"] != "Extended Range" {
		t.Fatal("using an infusion should post a card", card)
	}
	if _, sheet = both.sheet(gm, ember); at(sheet, "resources", "burn", "value") != float64(1) || at(sheet, "hp", "nonlethal") != float64(3) || blast["bonuses"].([]any)[0].(float64)+1 != first(sheet["attacks"].([]any)[len(sheet["attacks"].([]any))-1 : len(sheet["attacks"].([]any))])["bonuses"].([]any)[0] {
		t.Fatal("accepting burn should deal nonlethal damage and feed elemental overflow", sheet["resources"], sheet["hp"])
	}
	both.ok(gm, "easel.pf1e.actorAction", map[string]any{"actorId": ember, "action": "toggle", "data": map[string]any{"id": "gatherPower", "on": true}})
	both.ok(gm, "easel.pf1e.roll", map[string]any{"actorId": ember, "kind": "attack", "id": blast["id"], "options": map[string]any{}})
	if card := both.lastCard(gm); card["title"] != "Fire Blast" || card["subtitle"] != "Ranged touch attack" {
		t.Fatal("the blast did not reach chat", card)
	}
	if doc, _ = both.sheet(gm, ember); at(doc, "toggles", "gatherPower") != false {
		t.Fatal("making a blast should spend the gathered power", doc["toggles"])
	}
	both.ok(gm, "easel.pf1e.actorAction", map[string]any{"actorId": ember, "action": "resource", "data": map[string]any{"id": "burn", "delta": 9}})
	both.refused(gm, "easel.pf1e.roll", map[string]any{"actorId": ember, "kind": "use", "id": "talent/" + talents[1].(map[string]any)["uid"].(string), "options": map[string]any{}}, "past its limit")
	both.ok(gm, "easel.pf1e.actorAction", map[string]any{"actorId": ember, "action": "rest", "data": map[string]any{}})
	if _, sheet = both.sheet(gm, ember); at(sheet, "resources", "burn", "value") != float64(0) || at(sheet, "hp", "nonlethal") != float64(0) {
		t.Fatal("rest should remove burn", sheet["resources"])
	}
	fighter := both.ok(gm, "easel.pf1e.open", map[string]any{"actorId": both.actors(gm)["Aldric"]["id"]})["easel.pf1e.sheet"]["sheet"].(map[string]any)
	if len(fighter["sections"].([]any)) != 0 {
		t.Fatal("other characters should not get the kineticist's sections", fighter["sections"])
	}
}

func TestPathfinderPathOfWar(t *testing.T) {
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	service := &accounts.Service{Pool: pool}
	ctx := context.Background()
	gm, err := service.SignUp(ctx, "gamemaster", "correct horse", "Game Master")
	if err != nil {
		t.Fatal(err)
	}
	table := pathfinderGame(t, manager, ctx, gm, "Path of War", "easel.pathofwar.rules", "easel.pf1ekineticist.rules")
	if err := manager.Start(ctx, table.gameID); err != nil {
		t.Fatal(err)
	}
	system := table.ok(gm, "easel.pf1e.refresh", map[string]any{})["easel.pf1e.state"]["system"].(map[string]any)
	if len(system["extensions"].([]any)) != 2 || len(system["kinds"].([]any)) != 9 {
		t.Fatal("Path of War and the kineticist should both be installed", system["extensions"])
	}
	table.ok(gm, "easel.pf1e.actorCreate", map[string]any{"name": "Kara", "kind": "character", "entryId": ""})
	kara := table.actors(gm)["Kara"]["id"].(string)
	add := func(entry string) {
		t.Helper()
		table.ok(gm, "easel.pf1e.actorAdd", map[string]any{"actorId": kara, "entryId": entry, "options": map[string]any{}})
	}
	act := func(action string, data map[string]any) {
		t.Helper()
		table.ok(gm, "easel.pf1e.actorAction", map[string]any{"actorId": kara, "action": action, "data": data})
	}
	table.refused(gm, "easel.pf1e.actorAdd", map[string]any{"actorId": kara, "entryId": "maneuver:pommel-bash", "options": map[string]any{}}, "no levels in an initiator class")
	table.ok(gm, "easel.pf1e.actorUpdate", map[string]any{"actorId": kara, "changes": map[string]any{"set": map[string]any{"abilities.str.base": 16, "abilities.cha.base": 16}}})
	add("class:warlord")
	add("class:warlord")
	add("item:longsword")
	doc, sheet := table.sheet(gm, kara)
	table.ok(gm, "easel.pf1e.actorItem", map[string]any{"actorId": kara, "uid": first(doc["items"])["uid"], "changes": map[string]any{"equipped": true}})
	for _, entry := range []string{"maneuver:tactical-strike", "maneuver:encouraging-roar", "maneuver:crushing-blow", "maneuver:stance-of-aggression"} {
		add(entry)
	}
	table.refused(gm, "easel.pf1e.actorAdd", map[string]any{"actorId": kara, "entryId": "maneuver:charge-of-the-battle-cat", "options": map[string]any{}}, "up to level 1")
	opened := table.ok(gm, "easel.pf1e.open", map[string]any{"actorId": kara})["easel.pf1e.sheet"]["sheet"].(map[string]any)
	sections := opened["sections"].([]any)
	if len(sections) != 1 || sections[0].(map[string]any)["type"] != "pathofwar.maneuvers" {
		t.Fatal("an initiator should get the Maneuvers page and nothing from the kineticist", sections)
	}
	doc, sheet = table.sheet(gm, kara)
	if at(sheet, "initiating", "dc") != float64(13) || at(sheet, "initiating", "readied") != float64(4) {
		t.Fatal("initiator statistics are wrong", sheet["initiating"])
	}
	uid := map[string]string{}
	for _, entry := range at(doc, "lists", "maneuver").([]any) {
		maneuver := entry.(map[string]any)
		uid[maneuver["name"].(string)] = maneuver["uid"].(string)
	}
	strike := map[string]any{"actorId": kara, "kind": "maneuver", "id": uid["Tactical Strike"], "options": map[string]any{}}
	table.refused(gm, "easel.pf1e.roll", strike, "not readied")
	for _, name := range []string{"Tactical Strike", "Encouraging Roar", "Crushing Blow"} {
		act("pow.ready", map[string]any{"uid": uid[name], "on": true})
	}
	table.ok(gm, "easel.pf1e.roll", strike)
	card := table.lastCard(gm)
	if card["title"] != "Tactical Strike (Longsword)" || card["subtitle"] != "Golden Lion strike" || len(card["sections"].([]any)) < 2 {
		t.Fatal("the strike did not reach chat as an attack", card)
	}
	table.refused(gm, "easel.pf1e.roll", strike, "has been expended")
	act("pow.recover", map[string]any{"count": "one", "uid": uid["Tactical Strike"]})
	table.ok(gm, "easel.pf1e.roll", strike)
	before := first(sheet["attacks"])["bonuses"].([]any)[0].(float64)
	table.ok(gm, "easel.pf1e.roll", map[string]any{"actorId": kara, "kind": "maneuver", "id": uid["Encouraging Roar"], "options": map[string]any{}})
	if _, sheet = table.sheet(gm, kara); first(sheet["attacks"])["bonuses"].([]any)[0] != before+2 || at(sheet, "initiating", "count", "expended") != float64(2) {
		t.Fatal("a boost should apply its effect for the round", first(sheet["attacks"]), sheet["initiating"])
	}
	act("pow.stance", map[string]any{"uid": uid["Stance of Aggression"]})
	if _, sheet = table.sheet(gm, kara); len(first(sheet["attacks"])["damage"].([]any)) != 2 || at(sheet, "ac", "total") != float64(8) {
		t.Fatal("the stance should add its damage die and lower AC", first(sheet["attacks"]), sheet["ac"])
	}
	act("rest", map[string]any{})
	if _, sheet = table.sheet(gm, kara); at(sheet, "initiating", "count", "expended") != float64(0) {
		t.Fatal("rest should recover every maneuver", sheet["initiating"])
	}
}

func TestPathfinderBrowser(t *testing.T) {
	if os.Getenv("EASEL_PLAYWRIGHT_MODULE") == "" {
		t.Skip("set EASEL_PLAYWRIGHT_MODULE for browser acceptance")
	}
	pool := dbtest.Open(t)
	manager := gameManager(t, pool)
	service := &accounts.Service{Pool: pool}
	application := serverApplication(t, "../../server/easel/server", manager.Scripting(), ScriptedUsers(service))
	router, err := NewServerRouter(manager, application)
	if err != nil {
		t.Fatal(err)
	}
	site := httptest.NewUnstartedServer(nil)
	site.Config.Handler = NewHandler(Config{FrontendDir: "../../server/easel", Accounts: service, Policy: application, Router: router, PublicURL: "http://" + site.Listener.Addr().String(), ReportError: func(_ *http.Request, err error) { t.Log(err) }})
	site.Start()
	defer site.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 240*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, "node", "../../scripts/dev-pf1e.mjs", site.URL, "easel.pf1ehomebrew.example,easel.pf1ekineticist.rules,easel.pathofwar.rules")
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("browser: %v\n%s", err, output)
	} else {
		t.Log(string(output))
	}
}
