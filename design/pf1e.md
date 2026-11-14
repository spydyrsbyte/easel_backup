# Pathfinder 1e

`easel.pf1e.game` is a Pathfinder first edition table built on the virtual tabletop (`easel.vtt.table`, see `kit-ui.md`). It is designed to be extended: third-party rules and homebrew are added by modules that use the same registries the Pathfinder application itself is built from.

| Package | Holds |
|---|---|
| `easel.wotcogl35.rules` (module, `modules/wotcogl35/`) | The d20 3.x engine shared with D&D 3.5: typed bonuses, the calculation steps, resources, magic systems, attacks, damage, levels, the content library and the registries. No Pathfinder data. |
| `easel.pf1e.game` (application, `applications/pf1e/`) | The Pathfinder system tables, the core content pack, the stat block parser, records, the core rolls, actions and library kinds, the table wiring, and the sheet and library interface. |
| `easel.pf1ekineticist.rules` (module, `modules/pf1e-kineticist/`) | The kineticist, written entirely as an extension: a new resource, attacks, a library kind, sheet sections and a wrapped roll. The model for other subsystems. |
| `easel.pathofwar.rules` (module, `modules/pf1e-pathofwar/`) | Path of War: initiator classes, a maneuver library kind, readied, expended and recovered maneuvers, stances, and a Maneuvers sheet page drawn by the module's own browser code. |
| `easel.pf1ehomebrew.example` (module, `modules/pf1e-homebrew/`) | A small example of table house rules. |

## Creatures and changes

A creature is one JSON document. `engine.derive(document)` returns every number with the parts that make it up; nothing derived is stored. A monster is a creature in stat block mode: its final numbers come from the stat block and only temporary things are applied on top.

Everything that affects a creature is a *source*: its race, class and class features, feats, equipped items, active effects, conditions, and every entry in its `lists`. A source may carry any of these:

| Member | Meaning |
|---|---|
| `changes` | `{target, type, value or formula, toggle?, when?, note?}`. Same-type bonuses do not stack; dodge, racial, circumstance and untyped do, except from one source. A target is any name: a step reads the targets it cares about, so a new statistic takes changes like any other. |
| `resources` | Pools: `{id, name, max, counts: "up" or "down", recover: {rest, turn, encounter…}, text}`. Formulas read them as `@resources.<id>`. |
| `attacks` | Special attacks: `{name, kind, ability, touch, tags, damage: {count, die, bonus, type}, cost}`. Tags make targets such as `attack.blast` and `damage.blast`. |
| `toggles` | Switches shown on the sheet and read as `@toggles.<id>`. |
| `use` | What happens when it is activated: `{cost: [{resource, amount}], roll, save, buff, text}`. |
| `flags`, `defenses`, `senses`, `weapons`, `armors`, `classSkills`, `naturalAttacks` | As named. |

Formulas use `easel.rules.formula@1` with `@level`, `@hd`, `@bab`, `@str.mod`, `@class.level`, `@classes.<class>.level`, `@ranks.<skill>`, `@resources.<id>`, `@toggles.<id>`, `@armor.category`, `@load`, `@buff.level` and `@weapon.strMult`.

## Extending

A module extends the game by implementing `easel.wotcogl35.extension@1` (rules and interface) or `easel.wotcogl35.content@1` (library packs), and being chosen when the game is created. Any number can be active together. The extension's class has `install(game)`; `game` offers:

| Member | Use |
|---|---|
| `step(id, run, {before, after})`, `wrap(id, wrapper)`, `unstep(id)`, `steps()` | The calculation is a list of named steps: `levels`, `gear`, `abilities`, `resources`, `encumbrance`, `hitPoints`, `armorClass`, `saves`, `initiative`, `speed`, `skills`, `attacks`, `maneuvers`, `magic`, `summary`. Add one, replace one, wrap one, or remove one. |
| `magic` | Registry of magic systems. A class's `casting.system` names one; `vancian` (slots, prepared or spontaneous) is the one supplied. A system provides `derive`, `cast` and `rest`. |
| `resource(definition)` | A pool every creature has. |
| `rolls`, `actions`, `cardActions` | Registries of what a sheet can roll, what can be done to a creature, and what a chat card's buttons do. `set` adds one, `wrap` changes one. |
| `kinds` | Registry of library kinds: `{id, label, singular, icon, describe, group, add, form}`. Without `add`, entries go into `lists.<kind>` on the creature and act as sources. |
| `sections` | Sheet sections, each `{tab, tabLabel, title, when, type, …}`. Types: `resource`, `attacks` (by tag), `list` (a kind, optionally one group), `toggles`, `values` (formulas), `buttons`, `text`, or a type the module draws itself (below). A new `tab` id adds a tab. |
| `system`, `options` | The live tables: skills, conditions, saves, bonus types, progressions; and options such as `hitPoints`. |
| `on(hook, handler, priority)` | Hooks: `sources`, `derived`, `check`, `attack`, `damage`, `rest`, `levelUp`, `cast`. |
| `content`, `library` | Add, replace or remove library entries. |
| `edit`, `store`, `sheetOf`, `post`, `say`, `targets`, `cards`, `sheets`, `table` | The application's own helpers, for rolls and actions that change creatures or post to chat. |

The Pathfinder application registers its rolls, actions, card buttons, library kinds and its combat maneuver step through these same registries (`server/core.mjs`, `server/system.mjs`), before extensions are installed, so an extension can wrap or replace any of them.

When two extensions set the same thing, the one loaded later wins; hooks and wrappers all run.

### Browser code

A module can draw its own sheet sections. It implements the client interface `easel.pf1e.sheetsection@1` with a class whose `sections()` returns `{type: draw}`. The sheet calls `draw(section, api)` for every section of that type and appends the element it returns. `api` carries the sheet's own building blocks and requests: `h`, `button`, `iconButton`, `tile`, `pool`, `attacks`, `chip`, `block`, `empty`, the `doc`, `derived` and `system` data, `canWrite` and `canControl`, a `state` object that survives redraws, and `roll`, `act`, `set`, `view`, `request` and `remove`. Path of War's Maneuvers page is written this way.

A source with a `toggle` and `quiet: true` is switched by the module's own interface and is left out of the sheet's general list of switches; stances use this.

## Libraries

Every library entry has an id of the form `kind:slug`. Entries come from the core pack, from every content provider in the game, and from the game master at the table (`easel.pf1e.Entry` records); later ones replace earlier ones with the same id. Monsters are written as stat block text and parsed by `server/statblock.mjs`; the game master's import uses the same parser.

## At the table

- **Sheet:** `easel.pf1e.sheet@1`. Every ability, save, skill, attack, spell, feature, talent and usable item rolls on the server and posts a card to chat.
- **Chat buttons:** apply damage or healing, roll a save, or apply an effect to the selected tokens.
- **Library tab:** one list per kind, including kinds extensions add. Drag a monster onto the map; drag anything else onto an open sheet. The game master can import a stat block or make items, spells, feats and effects.
- **Who may do what:** owners change a sheet, controllers roll from it, and only the game master places monsters and edits the library. The server checks each of these.

## Known limits

- The core pack is a starting set, not the whole game: 16 classes, 7 races, about 120 feats, 190 items, 210 spells, 40 effects and 34 monsters.
- Attacks roll against no target: the game master compares the total to AC.
- Only one magic system, slot-based casting, is supplied. A point-based system would register through `magic`; none ships yet.
- Path of War covers the stalker, warder and warlord and 54 maneuvers and stances of levels 1 to 3. Class tables and maneuver effects were written from memory and must be checked against the book. Strikes, boosts with a simple bonus, saves and stances with numeric effects are automated; counters, movement, conditions on the target and anything else are text. Multiclass initiators pool their maneuvers known and readied instead of tracking them per class, and trading out old maneuvers at level-up is by hand. The mystic, harbinger and zealot, and maneuvers above level 3, are not included.
- Not automated in the core: two-weapon fighting sequences, weapon training groups, favored enemies, domain and bloodline powers, companions, wild shape statistics, metamagic.
- The kineticist is a working model, not a complete class: composite blasts, metakinesis, internal buffer and infusion specialization are text only.

## Verification

```powershell
node --test scripts/test-pf1e.mjs
./scripts/test-security.ps1 -Package ./internal/server -Run Pathfinder
node scripts/dev-pf1e.mjs http://127.0.0.1:5199 easel.pf1ehomebrew.example,easel.pf1ekineticist.rules,easel.pathofwar.rules
```

## Licence

The game content is Open Game Content under the Open Game License 1.0a; see `applications/pf1e/OGL.md`. It contains no setting material. Path of War has its own notice in `modules/pf1e-pathofwar/OGL.md`.
