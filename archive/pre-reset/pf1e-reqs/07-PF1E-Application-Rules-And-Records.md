# 07 — PF1e Application: Pathfinder-Only Records, Rules & Content (`easel.pf1e.game`)

## 1. Overview & Scope
The PF1e application (`easel.pf1e.game`, `type: "application"`, owner `easel`, host `pf1e`, name `game`) is the game itself. It is built from Core Kits, `easel.d20.kit`, and the shared `easel.wotcogl35.rules` module, and it owns everything that is specific to Pathfinder 1e.

This section covers the Pathfinder-only **records, rules, automations, statblock importer, and content**. Section 08 covers the server game/session, VTT records, sheets, and workspace.

**The test:** if a piece also holds under D&D 3.5 rules, it belongs in `easel.wotcogl35.rules` (Sections 05–06). If it is Pathfinder-only, it belongs here.

---

## 2. What It Is Pulling & Where From

| Piece | Source Reference in Workspace | How It Fits |
|---|---|---|
| Shared records & layers | `Easel/server/easel/modules/wotcogl35/` (Sections 05–06) | Extended with `.modify`, `.extends`, and PF1e record layers stacked on the module's layers. |
| PF1e skills, bonus types, conditions | [_referenceOnly/Data/systems/pf1/module/config.mjs](../_referenceOnly/Data/systems/pf1/module/config.mjs) & `registry/conditions.mjs` | The 35-skill list, `trait` bonus type, PF1e condition differences. |
| CMB / CMD / maneuvers | `actor-pf.mjs` | `CMB = BAB + Str (or Dex for Agile/Tiny-or-smaller) + special size mod + misc`; `CMD = 10 + BAB + Str + Dex + special size mod + deflection + dodge + insight + luck + morale + profane + sacred + circumstance` (flat-footed CMD drops Dex and dodge). |
| Paizo statblocks | Archives of Nethys / Bestiary text format | Parsed into `easel.wotcogl35.NPC` plus child records. |
| Existing code to move | `Easel/server/easel/modules/pf1e/` | PF1e-only parts of `rules-config.mjs`, `layers/actor-derived.mjs`, `statblock.mjs`, and `automations.mjs` move here. |

---

## 3. How to Build Each Piece

### 3.1 PF1e Records (`data` in `applications/pf1e/manifest.json`)
1. **New record types** (published as `easel.pf1e.<Type>`):
   - `Trait` (`.extends: "easel.wotcogl35.Feature"`): `traitType` (`combat`, `faith`, `magic`, `social`, `race`, `regional`, `religion`, `campaign`, `drawback`)
   - `Haunt` (`.extends: "easel.wotcogl35.Actor"`): `cr`, `noticeSkill`, `noticeDC`, `hp`, `trigger`, `reset`, `weakness`, `destruction`, `casterLevel`, `effectSummary`
   - `Vehicle` (`.extends: "easel.wotcogl35.Actor"`): `vehicleSize`, `squares`, `hardness`, `maxSpeed`, `acceleration`, `propulsion`, `drivingCheckSkill`, `drivingDevice`, `crew`, `passengers`, `cargoCapacityLbs`, `rammingDamage`
   - `Implant` (`.extends: "easel.wotcogl35.Item"`): `implantType` (`cybertech`, `biotech`, `necrograft`, `demonic`, `ioun`), `implantationValue`
2. **`.modify` additions to shared types**:
   - `easel.wotcogl35.Actor`: `pf1e` field branch with `cmbAbility`, `cmdAbilities`, `maneuverBonuses`, `vigor`, `maxVigor`, `wounds`, `maxWounds`, `backgroundSkillRanks`
   - `easel.wotcogl35.Character`: `traitIds`
   - `easel.wotcogl35.ClassLevel`: `favoredClassBonus` (`none`, `hp`, `skill`, `alt`)
   - `easel.wotcogl35.Race`: `flexibleAbilityBonus`
   - `easel.wotcogl35.Spellbook`: `spellPoints` (`{ value, max, maxFormula }`)

   `.modify` adds new top-level fields only, so each addition is a new field, never a change to an existing one.

### 3.2 PF1e Record Layers (`server/layers/*.mjs`)
PF1e layers stack on the module's layers and override its game hooks (Section 06):
- **`skillDefinitions()`**: the 35 PF1e skills (`acr` … `umd`) with ability, trained-only, and ACP flags; sub-skills for Craft, Perform, Profession, Knowledge, Artistry, Lore; class skill `+3` when ranks ≥ 1; rank budget `skillsPerLevel + Int mod + favored class skill + racial bonus`.
- **`bonusTypePolicy()`**: `super.bonusTypePolicy()` plus `trait: "highest"`.
- **`conditionDefinitions()`**: `super.conditionDefinitions()` plus PF1e-specific changes.
- **`deathThreshold()`**: negative Constitution score.
- **`concentrationFormula()`**: `@cl + @castingAbility.mod`.
- **`maneuverStats()`**: CMB, CMD, flat-footed CMD, and per-maneuver bonuses (bull rush, dirty trick, disarm, drag, grapple, overrun, reposition, steal, sunder, trip).
- **Favored class**: adds `+1 HP` or `+1 skill rank` per `ClassLevel.favoredClassBonus`.

### 3.3 PF1e Automations
Only PF1e-specific multi-record writes live here (e.g. `pf1e.AddClassLevel`, which creates a `ClassLevel`, applies favored class choices, and grants level-gated class features). Damage, rest, turns, and transfers use the shared `wotcogl35.*` automations.

### 3.4 Paizo Statblock Importer (`server/statblock.mjs`)
- Parses Paizo / Archives of Nethys PF1e text statblocks (CR, XP, alignment/size/type, Init, Senses, Aura, AC/HP/Saves/DR/Immune/Resist/SR, Speed/Melee/Ranged/Space/Reach/Special Attacks/Spell-Like Abilities/Spells, Str–Cha/Base Atk/CMB/CMD/Feats/Skills/Languages/SQ, Ecology, Special Abilities).
- Produces an `easel.wotcogl35.NPC` and its child `Feature`, `Spellbook`, `Spell`, `Action`, and `Item` records in one automation, and reports any line it could not parse.

### 3.5 PF1e Content & Compendium
- An importer that loads PF1e open-license content (races, classes, feats, traits, spells, equipment, bestiary) into compendium records.
- Compendium entries are records the game owns, browsed through Core `easel.collections.compendium@1` and dragged onto actors.

---

## 4. Anti-Spaghetti Guardrails for Section 07
1. **Extend, Don't Fork**: PF1e records extend or `.modify` shared types. Never copy a shared record type into the application.
2. **Override Hooks, Don't Patch the Module**: PF1e math goes in PF1e layers that call `super`; never edit `easel.wotcogl35.rules` to special-case Pathfinder.
3. **Generic Bricks Still Come from Kits**: if a PF1e piece turns out to be useful to other games, move it to a Kit.
4. **No Silent Fallbacks**: missing data raises a visible error; never substitute invented values.

---

## 5. Verification Checklist
- [ ] The application's `data` composes cleanly on top of `easel.wotcogl35.rules`.
- [ ] Unit tests verify CMB/CMD (normal and flat-footed) and the `trait` bonus type.
- [ ] Unit tests verify PF1e skill totals, trained-only enforcement, the class skill `+3`, and rank budgets including favored class choices.
- [ ] Unit tests verify the death threshold at negative Constitution.
- [ ] Unit tests verify the statblock importer turns a Bestiary statblock (e.g. Goblin, Adult Red Dragon) into valid records and reports unparsed lines.
