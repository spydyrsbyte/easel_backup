# 05 — WotC OGL 3.5 Module: Shared Schemas & Declarative Security (`easel.wotcogl35.rules`)

## 1. Overview & Scope
This section covers the record types and security of the **shared D&D 3.5 / Pathfinder 1e module** (`easel.wotcogl35.rules`, `type: "module"`, owner `easel`, host `wotcogl35`, name `rules`). Its records are published as `easel.wotcogl35.<Type>`.

**The test for every field and record in this module:** does it also hold under D&D 3.5 rules? If yes, it belongs here. If it is Pathfinder-only, it belongs in the PF1e application (Section 07), which adds it with `.modify` or `.extends` ([`Easel/design/data-schema.md`](../Easel/design/data-schema.md)).

1. **First-Class Record Schemas (`data` in `manifest.json`)**:
   - In Foundry VTT (`_referenceOnly/Data/systems/pf1`), races, classes, feats, spells, buffs, and physical gear were all stuffed into one overloaded `Item` document type.
   - **Easel has no such limitation.** Distinct concepts are **first-class record types** (`Race`, `Class`, `ClassLevel`, `Feature`/`Feat`/`ClassFeature`/`RacialTrait`, `Spellbook`, `Spell`, `Buff`, `Action`), and `Item` is reserved for **physical inventory** (`Weapon`, `Armor`, `Shield`, `WondrousItem`, `Consumable`, `Container`, `Loot`).
2. **Declarative Security (`server/security.mjs`) & Fog-of-Knowledge Projection**:
   - Enforces ownership and GM vs Player permissions at the Go server boundary.
   - Strips unidentified item true names, unidentified descriptions, curse text, and secret GM notes from non-GM client payloads before they leave the server.

### 1.1 What Is *Not* in This Module (Moved to the PF1e Application)
| PF1e-only piece | Why it is not shared | Where it goes |
|---|---|---|
| `Trait` record type (campaign, combat, faith, magic, regional, social, drawback) | PF1e character traits | `easel.pf1e.Trait` (`.extends: "easel.wotcogl35.Feature"`) |
| `Haunt` record type | PF1e hazard | `easel.pf1e.Haunt` |
| `Vehicle` record type | PF1e *Ultimate Combat* vehicle rules | `easel.pf1e.Vehicle` |
| `Implant` record type | PF1e *Occult Adventures* / *Technology Guide* | `easel.pf1e.Implant` |
| `ClassLevel.favoredClassBonus` (`hp`, `skill`, `alt`) | 3.5 favored class only waives the multiclass XP penalty | `.modify` on `easel.wotcogl35.ClassLevel` |
| `Actor.health` vigor & wounds | PF1e optional rule | `.modify` on `easel.wotcogl35.Actor` |
| `Actor.skills[*].backgroundRanks` | PF1e *Unchained* background skills | `.modify` on `easel.wotcogl35.Actor` |
| CMB/CMD settings, combat maneuver bonuses | 3.5 uses grapple modifier and opposed checks | `.modify` on `easel.wotcogl35.Actor` |
| `Race.flexibleAbilityBonus` (+2 to any one ability) | PF1e humans, half-elves, half-orcs | `.modify` on `easel.wotcogl35.Race` |
| `Spellbook.spellPoints` | PF1e optional spell-point systems | `.modify` on `easel.wotcogl35.Spellbook` |
| The 35-skill consolidated skill list | 3.5 has a different skill list | PF1e application data (Section 07) |

The VTT records (scenes, tokens, walls, fog, combat turn order, chat messages, journals, folders, dice settings) are not rules and are useful to any tabletop game, so they live in the generic `easel.vtt.table` module (Section 03A).

---

## 2. What It Is Pulling & Where From

| Schema / Concept | Source Reference in Workspace | How We Adapt It (Without Foundry's `Item` Overload) |
|---|---|---|
| Easel `data` & `security` format | [Easel/design/data-schema.md](../Easel/design/data-schema.md), [Easel/design/security-update.md](../Easel/design/security-update.md) | Uses Easel's native `data` declarations (`.name`, `.extends`, `.modify`, `.type`, `.default`, `.validate`, `*host.Type` references) and a `security` entry. |
| `Actor` (`Character`, `NPC`, `Trap`) | [_referenceOnly/Data/systems/pf1/module/documents/actor/](../_referenceOnly/Data/systems/pf1/module/documents/actor) | Keeps the attributes shared by 3.5 and PF1e (6 abilities, HP, skills map, AC/saves, currency, speed modes, senses, DR/ER/SR, biography/notes) and links to first-class `Race`, `ClassLevel`, `Feature`, `Spellbook`, `Buff`, and `Item` records. |
| `Race` | `item-race.mjs` | First-class `Race` record (`creatureType`, `subtypes`, `size`, `baseSpeeds`, `senses`, `languages`, `modifiers`, `grantedRacialTraits`). |
| `Class` & `ClassLevel` | `item-class.mjs` | First-class `Class` (HD, BAB progression, save progressions, skill ranks/level, class skills, casting config) and `ClassLevel` (advancement log). |
| `Feature` (`Feat`, `ClassFeature`, `RacialTrait`) | `item-feat.mjs` | First-class `Feature` base record with subtypes `Feat`, `ClassFeature`, `RacialTrait`. |
| `Spellbook` & `Spell` | `item-spell.mjs` & `actor/utils/spellbook.mjs` | First-class `Spellbook` (any number per actor) and `Spell`. |
| `Buff` | `item-buff.mjs` | First-class `Buff` record. |
| `Action` | `components/action.mjs` | First-class `Action` record attachable to a `Weapon`, `Consumable`, `Spell`, `Feature`, or natural attack. |
| Physical `Item` (`Weapon`, `Armor`, `Shield`, `WondrousItem`, `Consumable`, `Container`, `Loot`) | `documents/item/` | Strictly physical inventory with weight, price, HP/hardness, states, size, material, and fog-of-knowledge `identified` fields. |

---

## 3. How to Build the `data` Schemas (`Easel/server/easel/modules/wotcogl35/manifest.json`)

### 3.1 Value Sets the Game Supplies
Some fields hold values that differ between 3.5 and PF1e (skill keys, bonus types, casting types, condition keys). `.modify` can add fields but cannot widen a field's `.validate` rules, so the module declares these fields as plain strings or maps, and the game's record layer validates the allowed values:
- `skills` — map keyed by skill id; the game supplies its skill list.
- `modifiers[*].bonusType` — string; the module ships the bonus types shared by both games (`alchemical`, `armor`, `circumstance`, `competence`, `deflection`, `dodge`, `enhancement`, `inherent`, `insight`, `luck`, `morale`, `natural`, `profane`, `racial`, `resistance`, `sacred`, `shield`, `size`, `untyped`, `penalty`), and a game may add more (PF1e adds `trait`).
- `conditions` — map keyed by condition id; the module ships the shared conditions, and the game may add or redefine some.
- `Spellbook.castingType` — string; the module supports `prepared`, `spontaneous`, and `spelllike`, and a game may add more (PF1e adds `hybrid`).

### 3.2 Modifier & Context Note Embedded Structure
Every `Race`, `Feature`, `Buff`, and `Item` record stores its stat modifications in the shape consumed by Core `easel.effects.stacking@1` and `easel.rules.formula@1`:
- `modifiers`: `array` of `{ id, target, bonusType, formula, value, source, priority, condition, enabled }`
  - `target`: e.g. `"ac.normal"`, `"ability.str"`, `"save.all"`, `"save.fort"`, `"attack.melee"`, `"damage.melee"`, `"skill.<id>"`, `"speed.land"`, `"init"` (a game may add targets such as PF1e's `"cmb"` and `"cmd"`)
  - `formula`: formula string evaluated via `easel.rules.formula@1` (e.g. `"1 + floor(@classes.fighter.level / 4)"`)
- `contextNotes`: `array` of `{ target, text }`

### 3.3 First-Class Record Hierarchy

#### A. `Actor` Base & Subtypes
- **`Actor` (base)**:
  - `name`, `portrait`, `tokenImage`, `ownerUserId`, `observerUserIds`
  - `size` (`fine` … `colossal`), `alignment` (`lg` … `ce`)
  - `abilities` (`str` … `cha`, each `{ base, damage, drain, penalty }`)
  - `health` (`{ hp, maxHp, tempHp, nonlethal, fastHealing, regeneration }`)
  - `speeds` (`{ land, burrow, climb, fly, flyManeuverability, swim }`)
  - `senses` (`{ visionPreset, darkvisionFeet, lowLight, blindsenseFeet, blindsightFeet, tremorsenseFeet, scent, seeInvisibility, trueSeeingFeet, customSenses }`)
  - `defenses` (`{ naturalAC, srFormula, drEntries, energyResistances, immunities, vulnerabilities, conditionImmunities }`)
  - `conditions` (map of condition id → boolean)
  - `skills` (map of skill id → `{ ranks, classSkillOverride, acpApplied }`)
  - `currency` (`{ pp, gp, sp, cp }` plus weightless bank)
  - `notes` (`{ biography, description, gmNotes }`)
  - `baseAtkOverride`, `initBonus`, `settings`
- **`Character` (`.extends: "Actor"`)**: `raceId` (`*Race`), `xp`, `favoredClassIds`, `encumbranceOverride`
- **`NPC` (`.extends: "Actor"`)**: `cr`, `xpAward`, `creatureType`, `subtypes`, `racialHDFormula`, `environment`, `organization`, `treasure`, `sheetMode` (`full`, `lite`, `loot`), `statblockSource`
- **`Trap` (`.extends: "Actor"`)**: `cr`, `trapType` (`mechanical` | `magic`), `detectSkill`, `detectDC`, `disableSkill`, `disableDC`, `trigger`, `reset`, `duration`, `effectSummary`, `bypass` (the skill fields are strings because 3.5 uses Search and PF1e uses Perception)

#### B. `Race`
- `actorId` (`*Actor`, nullable for compendium templates), `name`, `description`
- `creatureType` (`aberration`, `animal`, `construct`, `dragon`, `fey`, `humanoid`, `magicalBeast`, `monstrousHumanoid`, `ooze`, `outsider`, `plant`, `undead`, `vermin`)
- `subtypes`, `size`, `baseSpeeds`, `senses`, `languages`, `modifiers`, `contextNotes`, `grantedRacialTraits`

#### C. `Class` & `ClassLevel`
- **`Class`**: `name`, `tag`, `classType` (`base`, `prestige`, `npc`, `racial`), `hitDie`, `babProgression` (`full`, `medium`, `low`), `saveProgressions` (`{ fort, ref, will }` each `good` | `poor`), `skillsPerLevel`, `classSkills`, `castingConfig`, `featureGrantsByLevel`
- **`ClassLevel`**: `actorId`, `classId` (`*Class`), `characterLevel`, `classLevel`, `hpRolled`, `skillRanksAllocated`, `grantedFeatures`, `ownerUserId`

#### D. `Feature` & Subtypes (`Feat`, `ClassFeature`, `RacialTrait`)
- **`Feature` (base)**: `actorId`, `name`, `description`, `abilityType` (`na`, `ex`, `su`, `sp`), `enabled`, `modifiers`, `contextNotes`, `charges` (`{ value, max, maxFormula, rechargePeriod, rechargeFormula }` for `easel.resources.charges@1`), `tags`, `ownerUserId`
- **`Feat`**: `featType` (string; the game supplies its categories), `prerequisites`
- **`ClassFeature`**: `classTag`, `levelAcquired`, `associations`
- **`RacialTrait`**: `raceName`, `replaces`

#### E. `Spellbook` & `Spell`
- **`Spellbook`**: `actorId`, `name`, `classTag`, `castingType` (see 3.1), `castingAbility` (`int`, `wis`, `cha`), `casterLevelFormula`, `concentrationBonusFormula`, `spellPenetrationBonusFormula`, `hasDomainsOrSchool`, `domainSlotCount`, `arcaneSpellFailureApplies`, `slotsByLevel` (levels `0..9` `{ base, bonusOverride, castRemaining, domainPrepared }`), `ownerUserId`
- **`Spell`**: `actorId`, `spellbookId`, `name`, `description`, `level` (`0..9`), `school`, `subschool`, `descriptors`, `components` (`{ verbal, somatic, material, materialDescription, materialCostGp, focus, focusDescription, divineFocus }`), `castingTime`, `range`, `area`, `targets`, `effect`, `duration`, `savingThrow`, `sr`, `isDomainOrSchoolSpell`, `isAtWill`, `preparation` (`{ preparedCount, maxPrepared, castCount }`), `ownerUserId`

#### F. `Buff`
- `actorId`, `name`, `description`, `icon`, `subType` (`temp`, `perm`, `item`, `misc`), `active`, `casterLevel`
- `duration` (`{ formula, unit: "round" | "minute" | "tenMinute" | "hour" | "day" | "permanent", remainingRounds, expireOnTurnStart, sourceActorId }`)
- `modifiers`, `contextNotes`, `conditionsGranted`, `ownerUserId`

#### G. `Action`
- `actorId`, `parentRecordType` (`"Item" | "Spell" | "Feature" | "Actor"`), `parentRecordId`
- `name`, `actionType` (`mwak`, `rwak`, `msak`, `rsak`, `save`, `heal`, `other`; a game may add types such as PF1e's `mcman`/`rcman`)
- `activation` (`{ type: "standard" | "move" | "swift" | "immediate" | "full" | "free" | "passive", cost }`)
- `range`, `measureTemplate`, `attackBonusFormula`, `critRange`, `critMultiplier`, `primaryAttack`
- `extraAttacks` (`{ mode: "none" | "standardIteratives" | "flurry" | "custom", customFormulae }`)
- `damageParts` (`array` of `{ formula, damageTypes, isNonlethal, isPrecision }`), `abilityDamageMultiplier`
- `conditionalModifiers`, `modifiers`, `contextNotes`
- `save` (`{ type: "fort" | "ref" | "will", dcFormula, description: "negates" | "half" | "partial" | "disbelief" }`)
- `usesCost`, `ammoType`, `soundEffect`, `ownerUserId`

#### H. Physical `Item` Base & Subtypes
- **`Item` (base)**: `actorId`, `containerId` (`*Container`), `name`, `description`, `icon`, `quantity`, `weightLbs`, `priceGp`, `size`, `hp`, `maxHp`, `hardness`, `carried`, `equipped`, `slot`, `masterwork`, `broken`, `modifiers`, `contextNotes`, `charges`, `ownerUserId`
  - **Fog-of-Knowledge fields**: `identified`, `unidentifiedName`, `unidentifiedDescription`, `unidentifiedPriceGp`, `auraSchool`, `cl`, `identifyDC`, `cursed`, `curseDescription`
- **`Weapon`**: `weaponCategory` (`simple`, `martial`, `exotic`), `weaponSubtype` (`light`, `oneHanded`, `twoHanded`, `ranged`, `ammunition`), `weaponGroups`, `baseDamageDice`, `critRange`, `critMultiplier`, `rangeIncrementFeet`, `enhancementBonus`, `material`, `properties`, `heldMode`
- **`Armor`**: `armorCategory` (`light`, `medium`, `heavy`), `armorBonus`, `enhancementBonus`, `maxDexBonus`, `armorCheckPenalty`, `arcaneSpellFailure`, `material`
- **`Shield`**: `shieldCategory` (`buckler`, `light`, `heavy`, `tower`), `shieldBonus`, `enhancementBonus`, `maxDexBonus`, `armorCheckPenalty`, `arcaneSpellFailure`, `material`
- **`WondrousItem`**: `bodySlot`
- **`Consumable`**: `consumableType` (`potion`, `scroll`, `wand`, `rod`, `staff`, `poison`, `ammo`, `food`, `other`), `destroyOnEmpty`, `spellId` (`*Spell`)
- **`Container`**: `weightReductionPercent`, `constantWeightLbs`, `maxCapacityWeightLbs`, `currency`
- **`Loot`**: `lootType`

---

## 4. How to Build Declarative Security (`server/security.mjs`)

1. **Role & Ownership Resolution**:
   - **GM Users**: Full read/write access to all records, all fields, all actors, and all unidentified items.
   - **Actor Owners** (`actor.ownerUserId === userId`): Read/write access to their own `Actor` and its child records, **except** fog-of-knowledge fields.
   - **Observers** (`actor.observerUserIds.includes(userId)`): Read-only access to the `Actor` and its child records (excluding fog-of-knowledge fields).
   - **Other Players**: Read access only to public token presentation fields and lootable `NPC` (`sheetMode === "loot"`) inventory.
   - GM status comes from the game's role assignment, never from owning an actor.
2. **Fog-of-Knowledge Field Stripping**:
   - Always strip `notes.gmNotes` from `Actor` for non-GM viewers.
   - If `item.identified === false`: replace `name`, `description`, and `priceGp` with the unidentified values, and strip `cursed`, `curseDescription`, `auraSchool`, `cl`, `identifyDC`, and hidden `modifiers`.
3. **Child Records Added by a Game**: The game's security entry covers its own record types (`easel.pf1e.Trait`, `easel.pf1e.Haunt`, scenes, tokens) using the same ownership rules.

---

## 5. Anti-Spaghetti Guardrails for Section 05
1. **Never Stuff Non-Physical Entities into `Item`**: Use the dedicated first-class record types.
2. **Never Put Pathfinder-Only Fields Here**: If 3.5 has no equivalent, the PF1e application adds it with `.modify` or `.extends` (Section 07).
3. **Never Leak Unidentified Item Secrets to the Browser**: Stripping happens on the server, never via CSS hiding on the client.
4. **Never Create SQL Migration Files**: Edit `schema.sql` directly if core SQL ever needs adjustment.

---

## 6. Verification Checklist
- [ ] `manifest.json` validates cleanly with all shared record types.
- [ ] A game package can `.modify` `easel.wotcogl35.Actor`, `ClassLevel`, `Race`, and `Spellbook` and `.extends` `easel.wotcogl35.Feature` and `easel.wotcogl35.Actor` without errors.
- [ ] Security tests verify that a non-GM player inspecting an `Item` with `identified: false` receives only the unidentified values, with `cursed`, `curseDescription`, and the true `name` absent from the wire JSON.
- [ ] Security tests verify that `Actor.notes.gmNotes` is never transmitted to non-GM players.
