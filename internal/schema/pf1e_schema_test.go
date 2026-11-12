package schema

import (
	"os"
	"testing"

	"easel/internal/manifest"
)

func TestPF1eSchemaComposition(t *testing.T) {
	pkg, err := manifest.Load(os.DirFS("../../server/easel/modules/pf1e"))
	if err != nil {
		t.Fatalf("load pf1e package: %v", err)
	}
	if pkg.ID() != "easel.pf1e.rules" {
		t.Fatalf("unexpected package id: %s", pkg.ID())
	}
	vtt, err := manifest.Load(os.DirFS("../../server/easel/modules/vtt"))
	if err != nil {
		t.Fatal(err)
	}
	s, err := Compose([]manifest.Package{vtt, pkg})
	if err != nil {
		t.Fatalf("compose pf1e schema: %v", err)
	}

	expectedTypes := []string{
		"easel.pf1e.Actor",
		"easel.pf1e.Character",
		"easel.pf1e.NPC",
		"easel.pf1e.Vehicle",
		"easel.pf1e.Trap",
		"easel.pf1e.Haunt",
		"easel.pf1e.Race",
		"easel.pf1e.Class",
		"easel.pf1e.ClassLevel",
		"easel.pf1e.Feature",
		"easel.pf1e.Feat",
		"easel.pf1e.ClassFeature",
		"easel.pf1e.Trait",
		"easel.pf1e.RacialTrait",
		"easel.pf1e.Spellbook",
		"easel.pf1e.Spell",
		"easel.pf1e.Buff",
		"easel.pf1e.Action",
		"easel.pf1e.Item",
		"easel.pf1e.Weapon",
		"easel.pf1e.Armor",
		"easel.pf1e.Shield",
		"easel.pf1e.WondrousItem",
		"easel.pf1e.Consumable",
		"easel.pf1e.Container",
		"easel.pf1e.Loot",
		"easel.pf1e.Implant",
	}

	for _, typeID := range expectedTypes {
		typ, err := s.Type(typeID)
		if err != nil {
			t.Errorf("missing expected type %s: %v", typeID, err)
			continue
		}
		if typ.Owner != "easel.pf1e.rules" {
			t.Errorf("type %s has unexpected owner: %s", typeID, typ.Owner)
		}
	}

	actorType, _ := s.Type("easel.pf1e.Actor")
	if _, ok := actorType.Fields["abilities"]; !ok {
		t.Errorf("Actor missing abilities field")
	}
	if _, ok := actorType.Fields["health"]; !ok {
		t.Errorf("Actor missing health field")
	}
	if _, ok := actorType.Fields["skills"]; !ok {
		t.Errorf("Actor missing skills field")
	}
	if _, ok := actorType.Fields["conditions"]; !ok {
		t.Errorf("Actor missing conditions field")
	}

	characterType, _ := s.Type("easel.pf1e.Character")
	if characterType.Parent != "easel.pf1e.Actor" {
		t.Errorf("Character parent got %s, want easel.pf1e.Actor", characterType.Parent)
	}
	if _, ok := characterType.Fields["abilities"]; !ok {
		t.Errorf("Character did not inherit abilities from Actor")
	}
	if _, ok := characterType.Fields["raceId"]; !ok {
		t.Errorf("Character missing raceId field")
	}

	raceType, _ := s.Type("easel.pf1e.Race")
	if _, ok := raceType.Fields["grantedRacialTraits"]; !ok {
		t.Errorf("Race missing grantedRacialTraits field")
	}

	classLevelType, _ := s.Type("easel.pf1e.ClassLevel")
	if _, ok := classLevelType.Fields["grantedFeatures"]; !ok {
		t.Errorf("ClassLevel missing grantedFeatures field")
	}

	actionType, _ := s.Type("easel.pf1e.Action")
	if _, ok := actionType.Fields["actionCost"]; !ok {
		t.Errorf("Action missing actionCost field")
	}
	if _, ok := actionType.Fields["savingThrow"]; !ok {
		t.Errorf("Action missing savingThrow field")
	}
	if _, ok := actionType.Fields["damageParts"]; !ok {
		t.Errorf("Action missing damageParts field")
	}

	weaponType, _ := s.Type("easel.pf1e.Weapon")
	if weaponType.Parent != "easel.pf1e.Item" {
		t.Errorf("Weapon parent got %s, want easel.pf1e.Item", weaponType.Parent)
	}
	if _, ok := weaponType.Fields["identified"]; !ok {
		t.Errorf("Weapon did not inherit identified from Item")
	}
	if _, ok := weaponType.Fields["unidentifiedName"]; !ok {
		t.Errorf("Weapon did not inherit unidentifiedName from Item")
	}
	if _, ok := weaponType.Fields["baseDamageDice"]; !ok {
		t.Errorf("Weapon missing baseDamageDice")
	}

	testChar := map[string]any{
		"name":              "Valeros",
		"ownerUserIds":      []any{"user-1"},
		"viewerUserIds":     []any{"user-2"},
		"controllerUserIds": []any{},
		"size":              "medium",
		"alignment":         "ng",
		"abilities": map[string]any{
			"str": map[string]any{"base": 16.0, "damage": 0.0, "drain": 0.0, "penalty": 0.0},
			"dex": map[string]any{"base": 14.0, "damage": 0.0, "drain": 0.0, "penalty": 0.0},
			"con": map[string]any{"base": 14.0, "damage": 0.0, "drain": 0.0, "penalty": 0.0},
			"int": map[string]any{"base": 10.0, "damage": 0.0, "drain": 0.0, "penalty": 0.0},
			"wis": map[string]any{"base": 12.0, "damage": 0.0, "drain": 0.0, "penalty": 0.0},
			"cha": map[string]any{"base": 10.0, "damage": 0.0, "drain": 0.0, "penalty": 0.0},
		},
		"health": map[string]any{
			"hp": 12.0, "maxHp": 12.0, "tempHp": 0.0, "nonlethal": 0.0,
			"vigor": 0.0, "maxVigor": 0.0, "wounds": 0.0, "maxWounds": 0.0,
			"fastHealing": 0.0, "regeneration": 0.0,
		},
		"speeds": map[string]any{
			"land": 30.0, "burrow": 0.0, "climb": 0.0, "fly": 0.0, "swim": 0.0,
		},
		"senses": map[string]any{
			"visionPreset": "normal", "darkvisionFeet": 0.0, "lowLight": false,
			"blindsenseFeet": 0.0, "blindsightFeet": 0.0, "tremorsenseFeet": 0.0,
			"scent": false, "seeInvisibility": false, "trueSeeingFeet": 0.0,
		},
		"defenses": map[string]any{
			"naturalAC": 0.0, "drEntries": []any{}, "energyResistances": []any{},
			"immunities": []any{}, "vulnerabilities": []any{}, "conditionImmunities": []any{},
		},
		"conditions": map[string]any{
			"bleeding": false, "blinded": false, "confused": false, "cowering": false,
			"dazed": false, "dazzled": false, "dead": false, "deafened": false,
			"disabled": false, "dying": false, "energyDrained": false, "entangled": false,
			"exhausted": false, "fascinated": false, "fatigued": false, "fear": false,
			"frightened": false, "grappled": false, "helpless": false, "incorporeal": false,
			"invisible": false, "nauseated": false, "panicked": false, "paralyzed": false,
			"petrified": false, "pinned": false, "prone": false, "shaken": false,
			"sickened": false, "sinking": false, "stable": false, "staggered": false,
			"stunned": false, "unconscious": false,
		},
		"skills": map[string]any{
			"climb": map[string]any{"ranks": 1.0, "classSkillOverride": true, "acpApplied": true, "backgroundRanks": 0.0},
		},
		"currency": map[string]any{
			"pp": 0.0, "gp": 150.0, "sp": 0.0, "cp": 0.0,
			"bank": map[string]any{"pp": 0.0, "gp": 0.0, "sp": 0.0, "cp": 0.0},
		},
		"notes": map[string]any{
			"biography": "A brave fighter.",
		},
		"xp":              0.0,
		"favoredClassIds": []any{},
	}
	if err := s.Validate("easel.pf1e.Character", testChar); err != nil {
		t.Fatalf("Character record validation failed: %v", err)
	}

	testWeapon := map[string]any{
		"name":               "Longsword +1",
		"quantity":           1.0,
		"weightLbs":          4.0,
		"priceGp":            2315.0,
		"size":               "medium",
		"hp":                 10.0,
		"maxHp":              10.0,
		"hardness":           10.0,
		"carried":            true,
		"equipped":           true,
		"masterwork":         true,
		"broken":             false,
		"identified":         true,
		"modifiers":          []any{},
		"contextNotes":       []any{},
		"weaponCategory":     "martial",
		"weaponSubtype":      "oneHanded",
		"weaponGroups":       []any{"heavyBlades"},
		"baseDamageDice":     "1d8",
		"critRange":          19.0,
		"critMultiplier":     2.0,
		"rangeIncrementFeet": 0.0,
		"enhancementBonus":   1.0,
		"material":           "steel",
		"properties": map[string]any{
			"finessable": false, "reach": false, "brace": false, "disarm": false,
			"double": false, "nonlethal": false, "monk": false, "sunder": false,
			"trip": false, "deadly": false, "distracting": false, "fragile": false,
		},
		"heldMode": "oneHanded",
	}
	if err := s.Validate("easel.pf1e.Weapon", testWeapon); err != nil {
		t.Fatalf("Weapon record validation failed: %v", err)
	}

	testRace := map[string]any{
		"name":         "Elf",
		"creatureType": "humanoid",
		"subtypes":     []any{"elf"},
		"size":         "medium",
		"baseSpeeds": map[string]any{
			"land": 30.0, "burrow": 0.0, "climb": 0.0, "fly": 0.0, "swim": 0.0,
		},
		"senses": map[string]any{
			"darkvisionFeet": 0.0,
			"lowLight":       true,
		},
		"languages":           []any{"common", "elven"},
		"modifiers":           []any{},
		"contextNotes":        []any{},
		"grantedRacialTraits": []any{"elvenImmunities", "keenSenses"},
	}
	if err := s.Validate("easel.pf1e.Race", testRace); err != nil {
		t.Fatalf("Race validation failed: %v", err)
	}

	testAction := map[string]any{
		"name":             "Power Attack Slash",
		"actionType":       "mwak",
		"parentRecordType": "Item",
		"parentRecordId":   "item-sword-1",
		"activation": map[string]any{
			"type": "standard",
			"cost": 1.0,
		},
		"actionCost": 1.0,
		"range": map[string]any{
			"value":         5.0,
			"units":         "melee",
			"maxIncrements": 1.0,
		},
		"attackBonusFormula":      "@bab + @abilities.str.mod",
		"critRange":               19.0,
		"critMultiplier":          2.0,
		"primaryAttack":           true,
		"extraAttacks":            map[string]any{"mode": "none", "customFormulae": []any{}},
		"damageParts":             []any{map[string]any{"formula": "1d8 + @abilities.str.mod"}},
		"abilityDamageMultiplier": 1.0,
		"conditionalModifiers":    []any{},
		"modifiers":               []any{},
		"contextNotes":            []any{},
		"savingThrow": map[string]any{
			"type":        "fort",
			"dcFormula":   "10 + floor(@classes.fighter.level / 2)",
			"description": "negates",
		},
		"usesCost": 0.0,
	}
	if err := s.Validate("easel.pf1e.Action", testAction); err != nil {
		t.Fatalf("Action validation failed: %v", err)
	}
}
