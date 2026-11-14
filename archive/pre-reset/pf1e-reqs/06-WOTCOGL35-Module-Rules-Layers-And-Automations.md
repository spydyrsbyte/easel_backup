# 06 — WotC OGL 3.5 Module: Shared Rules, Record Layers, Automations & Panels (`easel.wotcogl35.rules`)

## 1. Overview & Scope
This section covers the rules shared by **D&D 3.5 and Pathfinder 1e** in `easel.wotcogl35.rules`:
1. **Bonus Stacking & Stat Dependency Graph**: the shared bonus types and derived-stat order, fed into Core `easel.effects.stacking@1`, `easel.rules.modifier@1`, `easel.characters.derived@1`, and `easel.rules.formula@1` (Section 01).
2. **Composable Record Layers**: `export class <Type>` layers on `Actor`, `Character`, `NPC`, `Item`, `Weapon`, `Armor`, `Spellbook`, `Spell`, `Buff`, and `Action` that compute shared derived stats. A game stacks its own layers on top (load order puts the application after the module), so `super` reaches these.
3. **Shared Mechanics**: ability modifiers, BAB and save progressions, HP from Hit Dice, AC (normal/touch/flat-footed), iterative, two-weapon, and natural attacks, shared conditions, encumbrance and armor limits, Vancian spellcasting, and sense presets with illusion disbelief.
4. **Go-Interpreted Automations**: `wotcogl35.ApplyDamage`, `wotcogl35.SpendActionUses`, `wotcogl35.Rest`, `wotcogl35.AdvanceTurn`, `wotcogl35.TransferItem`, `wotcogl35.TransferCoin`.
5. **Shared Client Panels**: sheet panels and the record editor that look the same in both games.

**Game hooks.** Where 3.5 and PF1e share a mechanism but differ in values, this module defines the mechanism and reads the values from a record-layer method the game overrides. A layer with no game override uses a neutral default, never a PF1e or 3.5 assumption.

| Hook (layer method) | 3.5 value | PF1e value (supplied in Section 07) |
|---|---|---|
| `skillDefinitions()` | 3.5 skill list, cross-class ranks cost 2 | 35 consolidated skills, `+3` trained class skills |
| `bonusTypePolicy()` | shared policy table | shared table plus `trait: "highest"` |
| `conditionDefinitions()` | shared conditions | shared conditions plus PF1e changes |
| `deathThreshold()` | `-10` | `-Con score` |
| `concentrationFormula()` | Concentration skill | `@cl + @castingAbility.mod` |
| `maneuverStats()` | grapple modifier | CMB/CMD |

---

## 2. What It Is Pulling & Where From

| Component | Source Reference in Workspace | What to Extract & Adapt |
|---|---|---|
| Core Stacking, Modifier & Derived Bricks | `Easel/server/easel/server/library/effects`, `rules`, `characters` | Consume via `Easel.Interfaces.create(...)` rather than writing a custom bonus pipeline. |
| d20 Kit calculators | `Easel/server/easel/server/library/d20/server/` | `abilities@1`, `check@1`, `defense@1`, `health@1`, `spellbook@1`, `size@1`, `damagetypes@1`, `grid@1`, `currency@1`. |
| Shared bonus types & stat targets | [_referenceOnly/Data/systems/pf1/module/config.mjs](../_referenceOnly/Data/systems/pf1/module/config.mjs) & `apply-changes.mjs` | Bonus types shared with the 3.5 SRD, which types stack (`dodge`, `circumstance`, `racial`, `untyped`, `penalty`), and the topological order of derived targets. |
| Iteratives / TWF / Natural Attacks | `actor-pf.mjs` & `components/action.mjs` | Iterative BAB (`+6/+11/+16`), TWF penalties (`-6/-10`, light off-hand `-4/-8`, TWF feat `-4/-4` and `-2/-2` with a light off-hand), primary/secondary natural attacks (`-5`, or `-2` with Multiattack). These are identical in 3.5 and PF1e. |
| Shared conditions | `registry/conditions.mjs` | Conditions with the same effect in both games; PF1e-only differences go to Section 07. |
| Encumbrance | `config.mjs` (`encumbranceLoads`) | Carrying capacity table, medium/heavy load Max Dex (`+3`/`+1`), ACP (`-3`/`-6`), and speed reduction (`30 → 20`, `20 → 15`). |
| Sense presets & illusion disbelief | `_Easel/Praxis/modules/rpgkit/0.1.0/interfaces/vision.js` & `records/token.js` | Darkvision, low-light, blindsense, blindsight, tremorsense, see invisibility, true seeing, and Will-save disbelief. |

---

## 3. How to Build Each Piece

### 3.1 Stacking Policy & Stat Dependency Graph (`server/rules-config.mjs`)
1. **`BONUS_TYPE_POLICY`** — passed to Core `easel.effects.stacking@1`:
   ```js
   export const BONUS_TYPE_POLICY = {
     alchemical: "highest", armor: "highest", circumstance: "sumBySource",
     competence: "highest", deflection: "highest", dodge: "sum",
     enhancement: "highest", inherent: "highest", insight: "highest",
     luck: "highest", morale: "highest", natural: "highest",
     profane: "highest", racial: "sum", resistance: "highest",
     sacred: "highest", shield: "highest", size: "highest",
     untyped: "sum", penalty: "sum"
   };
   ```
   The `Actor` layer's `bonusTypePolicy()` returns this table; a game extends it.
   - **Composite enhancement preprocessing**: armor, shield, and natural armor enhancement bonuses are folded into their parent bonus before stacking.
2. **`DERIVED_DEFINITIONS`** — fed into Core `easel.characters.derived@1` with explicit `deps`:
   1. `size`
   2. `ability.*.total` → `ability.*.mod` (with damage, drain, and penalty)
   3. `encumbrance` & `armorLimits`
   4. `bab` & `hd` (from `ClassLevel` records and `NPC.racialHDFormula`; the game's `Class` progressions)
   5. `hp.max` (`hd` + Con mod, or Cha mod for undead)
   6. `ac` (`normal`, `touch`, `flatFooted`) via `easel.d20.defense@1`
   7. `save.fort`, `save.ref`, `save.will`
   8. `init`
   9. `speed.*`
   10. `skills.*` (from the game's `skillDefinitions()`)
   11. `spellbooks.*` (caster level, concentration via `concentrationFormula()`, spell penetration, bonus slots, spell DCs) via `easel.d20.spellbook@1`
   12. `actions.*` (attack bonuses, iteratives, damage formulas, save DCs)

   A game adds definitions (PF1e adds `cmb` and `cmd`) through its `Actor` layer.

### 3.2 Composable Record Layers (`server/layers/*.mjs`)
Each layer covers one concern and calls `super`:
- **`actor-base.mjs`**: collects active modifiers and context notes from `Race`, `ClassLevel`s, enabled `Feature`s, active `Buff`s, active conditions, and equipped/carried `Item`s.
- **`actor-conditions.mjs`**: expands active conditions from `conditionDefinitions()` into modifiers and state flags (`loseDexToAC`, `cannotTakeStandardActions`, `maxMoveDistance`).
- **`actor-derived.mjs`**: runs the derived graph and builds the roll data context (`@abilities.str.mod`, `@bab`, `@cl`, `@classes.<tag>.level`, `@size`, `@armor.acp`).
- **`item-physical.mjs`**: broken-item penalties and container weight reduction.

### 3.3 Sense Presets & Illusion Disbelief (`server/vision.mjs`)
Registers shared hindrance materials and sense presets with Core `easel.maps.vision@1` and binds illusion disbelief to `easel.visibility.projection@1`:
- **Hindrances**: `stone`, `wood`, `metal`, `foliage`, `fog`, `magicalDarkness`, `invisibility`, `illusionGlamer`, `illusionFigment`.
- **Presets**: `normal`, `lowLight`, `darkvision` (`transformation: { saturation: 0 }`, range from the actor's `darkvisionFeet`), `seeInvisibility`, `blindsense`, `blindsight`, `tremorsense`, `trueSeeing`.
- **Disbelief**: a successful Will save against an illusion (`save.description === "disbelief"`) or `trueSeeing` records the viewer's `actorId` in `disbelievedByActorIds` and invalidates the presentation; for that viewer the illusion stops blocking sight and renders at reduced opacity.

### 3.4 Go-Interpreted Automations (`server/automations.mjs`)
All multi-record writes run as automations, inside one transaction:
1. **`wotcogl35.ApplyDamage`**: temp HP absorbs first; resolves DR, energy resistance, immunity, and vulnerability via `easel.d20.damagetypes@1`; handles nonlethal; sets `disabled`, `dying`, `dead` using the actor's `deathThreshold()`; healing reduces nonlethal by the same amount and is capped at `maxHp`.
2. **`wotcogl35.SpendActionUses`**: decrements `charges.value` on a `Feature`/`Item` (via `easel.resources.charges@1`), or a spell slot / prepared count, and deducts linked ammunition.
3. **`wotcogl35.Rest`**: 8-hour rest heals 1 HP per character level and 1 point of ability damage per ability (double for full bed rest), clears nonlethal, steps `exhausted → fatigued → normal`, resets per-day charges, and refreshes spell slots.
4. **`wotcogl35.AdvanceTurn`**: runs on `easel.vtt.table`'s `easel.vtt.turnStarted` / `easel.vtt.turnEnded` events (Section 03A); decrements buff durations for the active actor, expires buffs at `0`, and applies fast healing, regeneration, and bleed. Turn order itself belongs to `easel.vtt.table`.
5. **`wotcogl35.TransferItem`** and **`wotcogl35.TransferCoin`**: move an item or coins between actors and containers atomically.

### 3.5 Hooks into `easel.vtt.table`
Supplies the d20 hooks Section 03A asks a game for: actor resolution for `easel.wotcogl35.Actor`, d20 initiative (`1d20 + init`), the sense presets and hindrance materials from 3.3, illusion overrides, the 5-10-5 diagonal distance metric from `easel.d20.grid@1`, and the d20 roll card (`easel.d20.attackcard@1` / `easel.dice.rollcard@1`).

### 3.6 Shared Client Panels (`client/`)
Client interfaces for sheet sections that look and behave the same in 3.5 and PF1e. A game's sheet mounts them; they do not decide tab layout:
- **`easel.wotcogl35.abilitiespanel@1`**: ability block, saves, AC, and modifier breakdown (built from `easel.d20.abilityblock@1`, `defensebanner@1`, and `easel.rules.modifierlist@1`).
- **`easel.wotcogl35.inventorypanel@1`**: categorized physical item tables, equip/carry/identify states, charges, encumbrance meter, currency, and `easel.d20.equipmentslots@1`.
- **`easel.wotcogl35.featurespanel@1`**: class levels, feats, class features, and racial traits.
- **`easel.wotcogl35.spellbookspanel@1`**: spellbook sub-tabs built on `easel.d20.spellbook@1`.
- **`easel.wotcogl35.buffspanel@1`**: buff tables and the conditions grid (from the actor's condition definitions).
- **`easel.wotcogl35.recordeditor@1`**: editor for every record type in Section 05 (Description, Details, Actions, Modifiers & Context Notes, Charges, GM Identification tabs).

A panel never hardcodes PF1e or 3.5 skill names, bonus types, or conditions; it reads them from the props the game passes.

---

## 4. Anti-Spaghetti Guardrails for Section 06
1. **Never Duplicate `stacking@1` or `derived@1`**: this module supplies configuration data to the Core bricks; it does not write its own stacking loop.
2. **Keep Record Layers Small and Single-Purpose**: no 3,000-line `actor-pf.mjs` monolith.
3. **All Multi-Record Writes Go Through Automations**.
4. **No Pathfinder-Only Rules Here**: CMB/CMD, the 35-skill list, traits, favored class bonuses, death at negative Con, PF1e concentration, and Paizo statblocks belong to the PF1e application (Section 07).
5. **No Silent Fallbacks**: when a formula or record is missing, raise an error the user sees. Never substitute a made-up value (`1d8+4`, a fixed DC).

---

## 5. Verification Checklist
- [ ] Unit tests verify the shared bonus types stack correctly (`dodge`, `circumstance` from distinct sources, `racial`, `untyped`, `penalty` stack; the rest take highest).
- [ ] Unit tests verify composite armor/shield/natural enhancement stacking.
- [ ] Unit tests verify shared cascading conditions (`fatigued` + `fatigued` = `exhausted`; `blinded` removes positive Dex to AC).
- [ ] Unit tests verify iterative attacks (`BAB +11` → `+11/+6/+1`), two-weapon fighting penalties, and primary/secondary natural attacks.
- [ ] Unit tests verify every game hook works with both a 3.5-style override and a PF1e-style override.
- [ ] Unit tests verify sense presets and Will-save disbelief overrides.
