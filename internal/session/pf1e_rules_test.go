package session

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"testing"

	"easel/internal/automation"
	"easel/internal/manifest"
	"easel/internal/schema"
)

func jsonNumber(n int) json.Number { return json.Number(strconv.Itoa(n)) }

type memoryAutomationRepo struct {
	items map[string]automation.Saved
}

func (r *memoryAutomationRepo) Save(_ context.Context, saved automation.Saved) error {
	r.items[saved.Definition.Name] = saved
	return nil
}

func (r *memoryAutomationRepo) Load(_ context.Context, name string) (automation.Saved, error) {
	s, found := r.items[name]
	if !found {
		return automation.Saved{}, automation.ErrNotFound
	}
	return s, nil
}

func (r *memoryAutomationRepo) List(_ context.Context) ([]automation.Saved, error) {
	out := make([]automation.Saved, 0, len(r.items))
	for _, s := range r.items {
		out = append(out, s)
	}
	return out, nil
}

func (r *memoryAutomationRepo) Delete(_ context.Context, name string) error {
	delete(r.items, name)
	return nil
}

func TestPF1eAutomations(t *testing.T) {
	pkg, err := manifest.Load(os.DirFS("../../server/easel/modules/pf1e"))
	if err != nil {
		t.Fatalf("load pf1e: %v", err)
	}
	composedSchema, err := schema.Compose([]manifest.Package{vttModule(t), pkg})
	if err != nil {
		t.Fatalf("compose: %v", err)
	}

	repo := &memoryAutomationRepo{items: map[string]automation.Saved{}}
	recStore := &memoryRecords{
		schema: composedSchema,
		rows:   map[string]automation.Record{},
	}
	autoService := automation.New(repo, recStore, automation.AllowAllStub{})

	targetActor := automation.Record{
		Type: "easel.pf1e.Actor",
		ID:   "actor-1",
		Data: map[string]any{
			"name":              "Valeros",
			"ownerUserIds":      []any{"user-1"},
			"viewerUserIds":     []any{"user-2"},
			"controllerUserIds": []any{},
			"size":              "medium",
			"alignment":         "ng",
			"abilities": map[string]any{
				"str": map[string]any{"base": jsonNumber(16), "damage": jsonNumber(2), "drain": jsonNumber(0), "penalty": jsonNumber(0)},
				"dex": map[string]any{"base": jsonNumber(14), "damage": jsonNumber(0), "drain": jsonNumber(0), "penalty": jsonNumber(0)},
				"con": map[string]any{"base": jsonNumber(14), "damage": jsonNumber(0), "drain": jsonNumber(0), "penalty": jsonNumber(0)},
				"int": map[string]any{"base": jsonNumber(10), "damage": jsonNumber(0), "drain": jsonNumber(0), "penalty": jsonNumber(0)},
				"wis": map[string]any{"base": jsonNumber(12), "damage": jsonNumber(0), "drain": jsonNumber(0), "penalty": jsonNumber(0)},
				"cha": map[string]any{"base": jsonNumber(8), "damage": jsonNumber(0), "drain": jsonNumber(0), "penalty": jsonNumber(0)},
			},
			"health": map[string]any{
				"hp":           jsonNumber(20),
				"maxHp":        jsonNumber(20),
				"tempHp":       jsonNumber(5),
				"nonlethal":    jsonNumber(0),
				"vigor":        jsonNumber(0),
				"maxVigor":     jsonNumber(0),
				"wounds":       jsonNumber(0),
				"maxWounds":    jsonNumber(0),
				"fastHealing":  jsonNumber(2),
				"regeneration": jsonNumber(0),
			},
			"speeds": map[string]any{
				"land": jsonNumber(30), "burrow": jsonNumber(0), "climb": jsonNumber(0), "fly": jsonNumber(0), "swim": jsonNumber(0),
			},
			"senses": map[string]any{
				"visionPreset": "normal", "darkvisionFeet": jsonNumber(0), "lowLight": false,
				"blindsenseFeet": jsonNumber(0), "blindsightFeet": jsonNumber(0), "tremorsenseFeet": jsonNumber(0),
				"scent": false, "seeInvisibility": false, "trueSeeingFeet": jsonNumber(0),
			},
			"defenses": map[string]any{
				"naturalAC": jsonNumber(0), "drEntries": []any{}, "energyResistances": []any{},
				"immunities": []any{}, "vulnerabilities": []any{}, "conditionImmunities": []any{},
			},
			"conditions": map[string]any{
				"bleeding": false, "blinded": false, "confused": false, "cowering": false,
				"dazed": false, "dazzled": false, "dead": false, "deafened": false,
				"disabled": false, "dying": false, "energyDrained": false, "entangled": false,
				"exhausted": true, "fascinated": false, "fatigued": false, "fear": false,
				"frightened": false, "grappled": false, "helpless": false, "incorporeal": false,
				"invisible": false, "nauseated": false, "panicked": false, "paralyzed": false,
				"petrified": false, "pinned": false, "prone": false, "shaken": false,
				"sickened": false, "sinking": false, "stable": false, "staggered": false,
				"stunned": false, "unconscious": false,
			},
			"skills": map[string]any{},
			"currency": map[string]any{
				"pp": jsonNumber(0), "gp": jsonNumber(150), "sp": jsonNumber(0), "cp": jsonNumber(0),
				"bank": map[string]any{"pp": jsonNumber(0), "gp": jsonNumber(0), "sp": jsonNumber(0), "cp": jsonNumber(0)},
			},
			"notes": map[string]any{
				"biography": "A brave fighter.",
			},
		},
		Version: 1,
	}
	recStore.rows["actor-1"] = targetActor

	itemRecord := automation.Record{
		Type: "easel.pf1e.Item",
		ID:   "item-1",
		Data: map[string]any{
			"name":       "Wand of Cure Light Wounds",
			"actorId":    "actor-1",
			"quantity":   jsonNumber(1),
			"weightLbs":  jsonNumber(1),
			"priceGp":    jsonNumber(750),
			"size":       "medium",
			"hp":         jsonNumber(10),
			"maxHp":      jsonNumber(10),
			"hardness":   jsonNumber(5),
			"carried":    true,
			"equipped":   true,
			"broken":     false,
			"masterwork": false,
			"identified": true,
			"charges": map[string]any{
				"value": jsonNumber(50),
				"max":   jsonNumber(50),
			},
			"modifiers":    []any{},
			"contextNotes": []any{},
		},
		Version: 1,
	}
	recStore.rows["item-1"] = itemRecord

	actor2 := copyRecord(targetActor)
	actor2.ID = "actor-2"
	recStore.rows["actor-2"] = actor2

	containerRecord := automation.Record{
		Type: "easel.pf1e.Container",
		ID:   "container-1",
		Data: map[string]any{
			"name":         "Backpack",
			"quantity":     jsonNumber(1),
			"weightLbs":    jsonNumber(2),
			"priceGp":      jsonNumber(2),
			"size":         "medium",
			"hp":           jsonNumber(10),
			"maxHp":        jsonNumber(10),
			"hardness":     jsonNumber(2),
			"carried":      true,
			"equipped":     true,
			"broken":       false,
			"masterwork":   false,
			"identified":   true,
			"modifiers":    []any{},
			"contextNotes": []any{},
		},
		Version: 1,
	}
	recStore.rows["container-1"] = containerRecord

	spellRecord := automation.Record{
		Type: "easel.pf1e.Spell",
		ID:   "spell-1",
		Data: map[string]any{
			"name":        "Fireball",
			"level":       jsonNumber(3),
			"school":      "evo",
			"descriptors": []any{},
			"components": map[string]any{
				"verbal":      true,
				"somatic":     true,
				"material":    false,
				"focus":       false,
				"divineFocus": false,
			},
			"castingTime":           "1 standard action",
			"range":                 "long",
			"duration":              "instantaneous",
			"sr":                    true,
			"isDomainOrSchoolSpell": false,
			"isAtWill":              false,
			"preparation": map[string]any{
				"preparedCount": jsonNumber(2),
				"maxPrepared":   jsonNumber(2),
				"castCount":     jsonNumber(0),
			},
		},
		Version: 1,
	}
	recStore.rows["spell-1"] = spellRecord

	applyDamageDef := automation.Definition{
		Name:       "pf1e.ApplyDamage",
		Parameters: []string{"actorId", "amount", "isNonlethal"},
		Steps: []automation.Step{
			{Op: "load", Type: "easel.pf1e.Actor", ID: map[string]any{"arg": "actorId"}, As: "target"},
			{Op: "let", Name: "dmg", Value: map[string]any{"arg": "amount"}},
			{
				Op:        "if",
				Condition: map[string]any{"arg": "isNonlethal"},
				Then: []automation.Step{
					{Op: "delta", Target: map[string]any{"path": []any{"target", "health", "nonlethal"}}, Value: map[string]any{"var": "dmg"}},
					{
						Op: "if",
						Condition: map[string]any{
							"expr": "greaterOrEqual",
							"args": []any{
								map[string]any{"path": []any{"target", "health", "nonlethal"}},
								map[string]any{"path": []any{"target", "health", "hp"}},
							},
						},
						Then: []automation.Step{
							{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "staggered"}}, Value: true},
						},
					},
				},
				Else: []automation.Step{
					{Op: "let", Name: "temp", Value: map[string]any{"path": []any{"target", "health", "tempHp"}}},
					{
						Op: "if",
						Condition: map[string]any{
							"expr": "greaterThan",
							"args": []any{map[string]any{"var": "temp"}, 0},
						},
						Then: []automation.Step{
							{
								Op: "if",
								Condition: map[string]any{
									"expr": "greaterOrEqual",
									"args": []any{map[string]any{"var": "temp"}, map[string]any{"var": "dmg"}},
								},
								Then: []automation.Step{
									{
										Op:     "set",
										Target: map[string]any{"path": []any{"target", "health", "tempHp"}},
										Value: map[string]any{
											"expr": "subtract",
											"args": []any{map[string]any{"var": "temp"}, map[string]any{"var": "dmg"}},
										},
									},
									{Op: "set", Target: map[string]any{"var": "dmg"}, Value: 0},
								},
								Else: []automation.Step{
									{Op: "set", Target: map[string]any{"path": []any{"target", "health", "tempHp"}}, Value: 0},
									{
										Op:     "set",
										Target: map[string]any{"var": "dmg"},
										Value: map[string]any{
											"expr": "subtract",
											"args": []any{map[string]any{"var": "dmg"}, map[string]any{"var": "temp"}},
										},
									},
								},
							},
						},
					},
					{
						Op: "if",
						Condition: map[string]any{
							"expr": "greaterThan",
							"args": []any{map[string]any{"var": "dmg"}, 0},
						},
						Then: []automation.Step{
							{
								Op:     "set",
								Target: map[string]any{"path": []any{"target", "health", "hp"}},
								Value: map[string]any{
									"expr": "subtract",
									"args": []any{map[string]any{"path": []any{"target", "health", "hp"}}, map[string]any{"var": "dmg"}},
								},
							},
						},
					},
					{
						Op: "if",
						Condition: map[string]any{
							"expr": "lessOrEqual",
							"args": []any{map[string]any{"path": []any{"target", "health", "hp"}}, -10},
						},
						Then: []automation.Step{
							{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "dead"}}, Value: true},
							{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "dying"}}, Value: false},
							{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "disabled"}}, Value: false},
						},
						Else: []automation.Step{
							{
								Op: "if",
								Condition: map[string]any{
									"expr": "lessThan",
									"args": []any{map[string]any{"path": []any{"target", "health", "hp"}}, 0},
								},
								Then: []automation.Step{
									{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "dying"}}, Value: true},
									{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "disabled"}}, Value: false},
								},
								Else: []automation.Step{
									{
										Op: "if",
										Condition: map[string]any{
											"expr": "equals",
											"args": []any{map[string]any{"path": []any{"target", "health", "hp"}}, 0},
										},
										Then: []automation.Step{
											{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "disabled"}}, Value: true},
											{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "dying"}}, Value: false},
										},
									},
								},
							},
						},
					},
				},
			},
			{Op: "save", Record: "target"},
			{Op: "return", Value: map[string]any{"path": []any{"target", "health"}}},
		},
	}

	spendUsesDef := automation.Definition{
		Name:       "pf1e.SpendActionUses",
		Parameters: []string{"recordType", "recordId", "usesCost"},
		Steps: []automation.Step{
			{
				Op: "if",
				Condition: map[string]any{
					"expr": "equals",
					"args": []any{map[string]any{"arg": "recordType"}, "Item"},
				},
				Then: []automation.Step{
					{Op: "load", Type: "easel.pf1e.Item", ID: map[string]any{"arg": "recordId"}, As: "item"},
					{
						Op: "check",
						Condition: map[string]any{
							"expr": "greaterOrEqual",
							"args": []any{map[string]any{"path": []any{"item", "charges", "value"}}, map[string]any{"arg": "usesCost"}},
						},
						Message: "Not enough charges.",
					},
					{
						Op:     "set",
						Target: map[string]any{"path": []any{"item", "charges", "value"}},
						Value: map[string]any{
							"expr": "subtract",
							"args": []any{map[string]any{"path": []any{"item", "charges", "value"}}, map[string]any{"arg": "usesCost"}},
						},
					},
					{Op: "save", Record: "item"},
				},
			},
			{
				Op: "if",
				Condition: map[string]any{
					"expr": "equals",
					"args": []any{map[string]any{"arg": "recordType"}, "Spell"},
				},
				Then: []automation.Step{
					{Op: "load", Type: "easel.pf1e.Spell", ID: map[string]any{"arg": "recordId"}, As: "spell"},
					{
						Op: "check",
						Condition: map[string]any{
							"expr": "greaterOrEqual",
							"args": []any{map[string]any{"path": []any{"spell", "preparation", "preparedCount"}}, map[string]any{"arg": "usesCost"}},
						},
						Message: "Spell not prepared.",
					},
					{
						Op:     "set",
						Target: map[string]any{"path": []any{"spell", "preparation", "preparedCount"}},
						Value: map[string]any{
							"expr": "subtract",
							"args": []any{map[string]any{"path": []any{"spell", "preparation", "preparedCount"}}, map[string]any{"arg": "usesCost"}},
						},
					},
					{Op: "save", Record: "spell"},
				},
			},
			{Op: "return", Value: true},
		},
	}

	restDef := automation.Definition{
		Name:       "pf1e.Rest",
		Parameters: []string{"actorId", "isFullBedrest"},
		Steps: []automation.Step{
			{Op: "load", Type: "easel.pf1e.Actor", ID: map[string]any{"arg": "actorId"}, As: "target"},
			{Op: "let", Name: "healAmount", Value: 1},
			{
				Op:        "if",
				Condition: map[string]any{"arg": "isFullBedrest"},
				Then: []automation.Step{
					{Op: "set", Target: map[string]any{"var": "healAmount"}, Value: 2},
				},
			},
			{Op: "set", Target: map[string]any{"path": []any{"target", "health", "nonlethal"}}, Value: 0},
			{
				Op:   "let",
				Name: "newHp",
				Value: map[string]any{
					"expr": "add",
					"args": []any{map[string]any{"path": []any{"target", "health", "hp"}}, map[string]any{"var": "healAmount"}},
				},
			},
			{
				Op: "if",
				Condition: map[string]any{
					"expr": "greaterThan",
					"args": []any{map[string]any{"var": "newHp"}, map[string]any{"path": []any{"target", "health", "maxHp"}}},
				},
				Then: []automation.Step{
					{Op: "set", Target: map[string]any{"path": []any{"target", "health", "hp"}}, Value: map[string]any{"path": []any{"target", "health", "maxHp"}}},
				},
				Else: []automation.Step{
					{Op: "set", Target: map[string]any{"path": []any{"target", "health", "hp"}}, Value: map[string]any{"var": "newHp"}},
				},
			},
			{
				Op:        "if",
				Condition: map[string]any{"path": []any{"target", "conditions", "exhausted"}},
				Then: []automation.Step{
					{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "exhausted"}}, Value: false},
					{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "fatigued"}}, Value: true},
				},
				Else: []automation.Step{
					{
						Op:        "if",
						Condition: map[string]any{"path": []any{"target", "conditions", "fatigued"}},
						Then: []automation.Step{
							{Op: "set", Target: map[string]any{"path": []any{"target", "conditions", "fatigued"}}, Value: false},
						},
					},
				},
			},
			{
				Op: "if",
				Condition: map[string]any{
					"expr": "greaterThan",
					"args": []any{map[string]any{"path": []any{"target", "abilities", "str", "damage"}}, 0},
				},
				Then: []automation.Step{
					{
						Op:     "set",
						Target: map[string]any{"path": []any{"target", "abilities", "str", "damage"}},
						Value: map[string]any{
							"expr": "subtract",
							"args": []any{map[string]any{"path": []any{"target", "abilities", "str", "damage"}}, 1},
						},
					},
				},
			},
			{Op: "save", Record: "target"},
			{Op: "return", Value: map[string]any{"path": []any{"target", "health"}}},
		},
	}

	advanceTurnDef := automation.Definition{
		Name:       "pf1e.AdvanceTurn",
		Parameters: []string{"actorId"},
		Steps: []automation.Step{
			{Op: "load", Type: "easel.pf1e.Actor", ID: map[string]any{"arg": "actorId"}, As: "target"},
			{Op: "let", Name: "fh", Value: map[string]any{"path": []any{"target", "health", "fastHealing"}}},
			{
				Op: "if",
				Condition: map[string]any{
					"expr": "greaterThan",
					"args": []any{map[string]any{"var": "fh"}, 0},
				},
				Then: []automation.Step{
					{
						Op:   "let",
						Name: "regHp",
						Value: map[string]any{
							"expr": "add",
							"args": []any{map[string]any{"path": []any{"target", "health", "hp"}}, map[string]any{"var": "fh"}},
						},
					},
					{
						Op: "if",
						Condition: map[string]any{
							"expr": "greaterThan",
							"args": []any{map[string]any{"var": "regHp"}, map[string]any{"path": []any{"target", "health", "maxHp"}}},
						},
						Then: []automation.Step{
							{Op: "set", Target: map[string]any{"path": []any{"target", "health", "hp"}}, Value: map[string]any{"path": []any{"target", "health", "maxHp"}}},
						},
						Else: []automation.Step{
							{Op: "set", Target: map[string]any{"path": []any{"target", "health", "hp"}}, Value: map[string]any{"var": "regHp"}},
						},
					},
				},
			},
			{Op: "save", Record: "target"},
			{Op: "return", Value: map[string]any{"path": []any{"target", "health"}}},
		},
	}

	transferDef := automation.Definition{
		Name:       "pf1e.TransferItem",
		Parameters: []string{"itemId", "targetActorId", "targetContainerId"},
		Steps: []automation.Step{
			{Op: "load", Type: "easel.pf1e.Item", ID: map[string]any{"arg": "itemId"}, As: "item"},
			{Op: "set", Target: map[string]any{"path": []any{"item", "actorId"}}, Value: map[string]any{"arg": "targetActorId"}},
			{Op: "set", Target: map[string]any{"path": []any{"item", "containerId"}}, Value: map[string]any{"arg": "targetContainerId"}},
			{Op: "set", Target: map[string]any{"path": []any{"item", "equipped"}}, Value: false},
			{Op: "save", Record: "item"},
			{Op: "return", Value: map[string]any{"var": "item"}},
		},
	}

	for _, def := range []automation.Definition{applyDamageDef, spendUsesDef, restDef, advanceTurnDef, transferDef} {
		if err := autoService.Save(context.Background(), automation.Creator{Kind: automation.CreatorSystem, ID: "system"}, def); err != nil {
			t.Fatalf("save automation %s: %v", def.Name, err)
		}
	}

	ctx := context.Background()

	res, err := autoService.Run(ctx, "pf1e.ApplyDamage", []any{"actor-1", 10, false})
	if err != nil {
		t.Fatalf("run ApplyDamage: %v", err)
	}
	healthVal := res.Value.(map[string]any)
	if fmt.Sprint(healthVal["hp"]) != "15" {
		t.Errorf("expected hp 15 (5 absorbed by tempHp), got %v", healthVal["hp"])
	}
	if fmt.Sprint(healthVal["tempHp"]) != "0" {
		t.Errorf("expected tempHp 0, got %v", healthVal["tempHp"])
	}

	res, err = autoService.Run(ctx, "pf1e.ApplyDamage", []any{"actor-1", 10, true})
	if err != nil {
		t.Fatalf("run nonlethal ApplyDamage: %v", err)
	}
	healthVal = res.Value.(map[string]any)
	if fmt.Sprint(healthVal["nonlethal"]) != "10" {
		t.Errorf("expected nonlethal 10, got %v", healthVal["nonlethal"])
	}

	spendRes, err := autoService.Run(ctx, "pf1e.SpendActionUses", []any{"Item", "item-1", 2})
	if err != nil {
		t.Fatalf("run SpendActionUses item: %v", err)
	}
	if spendRes.Value != true {
		t.Errorf("expected spendUses true, got %v", spendRes.Value)
	}
	savedItem := recStore.rows["item-1"]
	chargesVal := savedItem.Data["charges"].(map[string]any)["value"]
	if fmt.Sprint(chargesVal) != "48" {
		t.Errorf("expected 48 charges remaining, got %v", chargesVal)
	}

	spellRes, err := autoService.Run(ctx, "pf1e.SpendActionUses", []any{"Spell", "spell-1", 1})
	if err != nil {
		t.Fatalf("run SpendActionUses spell: %v", err)
	}
	if spellRes.Value != true {
		t.Errorf("expected spendUses spell true, got %v", spellRes.Value)
	}
	savedSpell := recStore.rows["spell-1"]
	prepVal := savedSpell.Data["preparation"].(map[string]any)["preparedCount"]
	if fmt.Sprint(prepVal) != "1" {
		t.Errorf("expected 1 prepared count, got %v", prepVal)
	}

	restRes, err := autoService.Run(ctx, "pf1e.Rest", []any{"actor-1", false})
	if err != nil {
		t.Fatalf("run Rest: %v", err)
	}
	restHealth := restRes.Value.(map[string]any)
	if fmt.Sprint(restHealth["nonlethal"]) != "0" {
		t.Errorf("expected nonlethal cleared to 0, got %v", restHealth["nonlethal"])
	}
	savedActor := recStore.rows["actor-1"]
	conditionsMap := savedActor.Data["conditions"].(map[string]any)
	if conditionsMap["exhausted"] != false {
		t.Errorf("expected exhausted to be false after rest")
	}
	if conditionsMap["fatigued"] != true {
		t.Errorf("expected fatigued to be true after resting from exhausted")
	}
	strDamage := savedActor.Data["abilities"].(map[string]any)["str"].(map[string]any)["damage"]
	if fmt.Sprint(strDamage) != "1" {
		t.Errorf("expected str damage to heal from 2 to 1, got %v", strDamage)
	}

	turnRes, err := autoService.Run(ctx, "pf1e.AdvanceTurn", []any{"actor-1"})
	if err != nil {
		t.Fatalf("run AdvanceTurn: %v", err)
	}
	turnHealth := turnRes.Value.(map[string]any)
	if fmt.Sprint(turnHealth["hp"]) != "18" {
		t.Errorf("expected hp to heal by fastHealing 2 from 16 to 18, got %v", turnHealth["hp"])
	}

	transferRes, err := autoService.Run(ctx, "pf1e.TransferItem", []any{"item-1", "actor-2", "container-1"})
	if err != nil {
		t.Fatalf("run TransferItem: %v", err)
	}
	transferredItem := transferRes.Value.(map[string]any)
	if transferredItem["actorId"] != "actor-2" {
		t.Errorf("expected actorId actor-2, got %v", transferredItem["actorId"])
	}
	if transferredItem["containerId"] != "container-1" {
		t.Errorf("expected containerId container-1, got %v", transferredItem["containerId"])
	}
	if transferredItem["equipped"] != false {
		t.Errorf("expected equipped false after transfer")
	}
}
