# Pathfinder 1e implementation review

Reviewed October 29, 2026. Scope: the current Go/Sobek implementation in `Easel/`, its PF1e application and module, reusable kits, the new VTT module, and the requirements in `pf1e-reqs/`. No application source was changed during this review. Tests regenerated their existing screenshots and produced `Easel/bin/pf1e-audit-kit-tests.txt`.

## Assessment

The project has a working persisted character-sheet foundation, reusable UI and rules tools, and a separately tested VTT backend. It does not yet deliver the integrated Pathfinder VTT described in the requirements. The principal gaps are integration, rules correctness, character progression/content, and incomplete controls. A wholesale rewrite would discard useful work; additional cosmetic cleanup alone would leave the central problems intact.

The requirement documents already identify many of these defects. Their checklists describe intended work, not evidence that the work is complete. The newer `modules/vtt/` implementation is progress beyond the older PF1e code, but Pathfinder does not currently consume it.

## What is implemented

| Area | Verified state |
|---|---|
| Hosting and accounts | Go server, authentication, lobby, game membership and per-game runtimes exist. |
| Persistence | PF1e actors, child records and chat use Easel records backed by PostgreSQL in the hosted application. No localStorage, sessionStorage or IndexedDB usage was found in the PF1e application/module or VTT module. |
| Character basics | Create, rename, change abilities and HP, save equipment, reopen after browser reload. These paths passed the browser acceptance test. |
| Multiplayer | Two browser accounts exchange persisted chat; an unrelated player receives a restricted character projection and cannot rename the other player's character. Tested. |
| Sheets | Eleven character tabs, record editor and separate NPC component exist. The presence of a tab does not imply every action inside it works. |
| Basic play | Server-derived ability modifiers, basic rolls, direct sheet damage/healing and chat dice notation work on the tested paths. |
| Data model | Actors, physical item subtypes, features, class levels, spellbooks, spells, buffs and actions have separate schemas. This is useful groundwork. |
| Rules tools | Ability, defense, stacking, dice, map and other reusable tools exist and have tests. PF1e also has condition expansion, CMB/CMD helpers, encumbrance and a Paizo statblock parser. |
| VTT backend | `modules/vtt/` has records and server operations for scenes, tokens, doors, combat, chat modes, journals, folders and dice settings. Independent tests pass for security, scenes/tokens/doors, combat order and chat modes. It currently has no client binders and is not integrated into Pathfinder. |

## Findings, ordered by practical impact

### 1. Pathfinder's map and combat UI are disconnected from the VTT backend

`Easel/server/easel/applications/pf1e/manifest.json` still requires `easel.pf1e.rules`, not `easel.vtt.table`. The application entries delegate to the old PF1e game/controller. `modules/pf1e/client/controller.mjs:53` mounts a grid without an active scene; the combat tracker at line 121 receives optional initial combatants but has no turn-control handlers. Tool selection changes the toolbar/workspace property without wiring the selected tool into scene editing. The compendium at line 147 receives optional initial packs and has no content-loading/import workflow.

Consequently, the displayed workspace is not yet a usable shared battlemap with persisted scenes, token control, targeting, walls, doors, fog and encounters. Existing map/vision kit implementations and the new server module should be connected before rebuilding these capabilities elsewhere.

The VTT module also needs its real visibility hooks before player use: `table.mjs` defaults token visibility to true when no `visible` hook is supplied, apart from explicitly hidden tokens. Independent server tests do not establish complete Pathfinder fog-of-war behavior.

### 2. Attack and spell results cannot yet be trusted

In `modules/pf1e/server/game.mjs`:

- Lines 219–228 parse attack formulas as slash-separated integers rather than evaluating actor references. An expression such as `@bab + @abilities.str.mod` does not calculate the actor's attack bonus.
- Lines 247–295 invent `1d8+4` damage when missing, guess damage types from names, and use a limited regular expression that drops formula terms. A deterministic probe confirmed `1d8 + @abilities.str.mod` becomes plain `1d8`.
- Lines 465–524 invent damage, a Reflex save and DC `10 + level + 3` for spells without those details. A probe forced the prepared-spell spending operation to throw; casting still returned a damage result because the failure is swallowed.
- Similar empty catches can conceal action-charge failures. Identification uses a fixed bonus and returns an outcome without saving the item's identified state.

Replace these paths with record-driven formulas, actual actor/spellbook context and the existing dice/formula tools. Resource spending must succeed before an action is reported as successful. A spell with no damage action must not acquire invented damage.

### 3. Derived calculations have integration defects despite passing helper tests

`modules/pf1e/server/layers/actor-derived.mjs` contains a separate procedural calculation path in addition to the declarative definitions in `rules-config.mjs`.

Concrete probes found:

- Two competence bonuses of +2 and +3 to Perception produce +5. Skill modifiers are summed at line 296 instead of using the stacking service.
- A +3 deflection modifier changes AC from 10 to 13 while CMD remains 10. The CMD helper supports the bonus, but its caller at line 271 does not pass it.

Further inconsistencies visible in the code need targeted checks: BAB and base saves come from manually entered actor fields rather than class progression; derived maximum HP adds Constitution to a field that the UI treats as maximum HP; physical item calculations check `isBroken` while schemas/UI use `broken`; total carried weight counts every supplied item regardless of `carried`.

Compute mechanics from complete authoritative records, then project the result for the viewer. Currently `session.mjs:93` calculates derived stats using already-projected child records, so hidden item modifiers can produce different calculations for different viewers.

### 4. Many visible actions have no complete event path

| Control/workflow | Current gap |
|---|---|
| Add Level | Sheet emits `addClassLevel`; controller does not handle it. No class-progression automation is defined. |
| Buff ON/OFF | Sheet emits `toggleBuff`; controller does not handle it. |
| Equip/unequip/inspect slot | Controller emits events absent from the PF1e server registrations. |
| Concentration/caster-level rolls | Controller emits events absent from the PF1e server registrations. |
| Identify/unidentify | Sheet events are not wired through the character controller. Server identification also does not persist the result. |
| Add spell by drag and drop | Emits `addSpell` without a controller handler. Spellbook widget receives derived properties that the calculation does not populate. |
| Delete actor | Explicitly reports that deletion is unavailable. |
| Duplicate actor | Copies actor fields but does not copy inventory, classes, actions, spells or other child records. |
| Import statblock | Parser exists, but `session.mjs:62` explicitly rejects the live import operation. |
| Apply Damage from chat | Cards have no target actor; controller sends an empty actor ID. Direct sheet damage works. |
| Transfer coin | Calls `pf1e.TransferCoin`, which is absent from the automation definitions, then hides the failure. |
| NPC views | Actor-directory selection always opens the character sheet; separate NPC view code is not reached by that route. |
| GM/blind roll modes | Offered in UI, but old PF1e chat accepts only public/self, and action dialog mode is not carried through to the roll request. |

### 5. Character creation and content are incomplete

Race and Class schemas exist but the live record-save allowlist excludes them. There is no complete race/class selection, leveling, feature grant, favored-class or spell-preparation workflow. The compendium has a browser widget, not an integrated PF1e content library and importer.

These gaps prevent building a normal character through the UI without substantial manual data entry. The statblock parser is useful but is not equivalent to importing a complete, saved NPC with child records.

### 6. The planned package architecture is not implemented yet

The requirements call for core kits → d20 kit → shared `easel.wotcogl35.rules` and `easel.vtt.table` modules → PF1e application.

Current state: the reusable core/d20 kits exist; the VTT server module exists separately; `modules/wotcogl35/` does not exist. Most rules, records, sheets, persistence wiring and controller behavior remain in `modules/pf1e/`. The actual PF1e application entries remain thin delegates.

Perform the split using a working vertical feature as the acceptance criterion. Moving files alone will not fix calculations or connect the workspace. Existing schema/kit tests explicitly expect the old PF1e namespace/layout, so those tests must evolve with the refactor. Existing saved records also need a deliberate conversion strategy; do not discard them to make the new structure boot.

### 7. Presentation is improved but still exposes unfinished behavior

Fresh browser screenshots show a coherent dark workspace and parchment character sheet. Remaining visible problems include clipped sidebar labels, a largely empty map, raw actor UUIDs as roll speakers and literal `undefined` dice chips in `/r` chat results. The latter two appeared in a screenshot generated by a passing acceptance test.

Prioritize complete user workflows and clear unavailable states, then refine layout, information density, readable labels and actual map/content presentation.

## Verification performed

- `go test ./... -count=1`: passed. The ordinary run does not enable all optional database/browser integration tests.
- `node --test scripts/test-client.mjs`: 15 passed.
- `node --test scripts/test-kits.mjs`: 167 passed.
- `scripts/test-security.ps1 -Run 'PF1e|Pathfinder|VTT'`, with Playwright enabled: passed using an isolated temporary PostgreSQL cluster, including the Pathfinder browser test and VTT tests. The cluster was stopped and removed by the script.
- Inspected the fresh desktop workspace and character-sheet screenshots.
- Ran deterministic, read-only Node probes against attack/spell and derived-stat implementations to reproduce the formula, swallowed-casting-error, skill-stacking and CMD-integration defects above.

The browser test proves reload persistence and a narrow multiplayer flow. It does not prove a full server-restart recovery, a playable encounter, full character creation, spell preparation, complete fog-of-war security or Foundry feature parity. Kit tests mostly exercise tools and mocked component composition; some currently pass with the invented combat defaults.

## Suggested completion order

1. **Make results honest:** remove invented combat values and swallowed failures; evaluate formulas with actor context; fix skill stacking and CMD integration; add focused regression checks for these actual defects.
2. **Connect one complete encounter:** load the VTT module, create/activate a saved scene, place and move two actors' tokens, enforce ownership and visibility, run initiative/turn order, target a token and apply damage from chat.
3. **Complete one character lifecycle:** race/class selection, level advancement, derived BAB/saves/HP/skills, real inventory/equipment, buff toggles, spellbook preparation/casting/rest, complete duplication and deletion.
4. **Finish imports and content:** transactional statblock import, compendium content import/browsing and actor drop workflows.
5. **Complete the package split while preserving records**, following the existing architecture requirements and keeping the encounter/character acceptance flows working throughout.
6. **Polish and verify campaign use:** NPC views, journals/folders, dice settings, private rolls, readable roll cards, responsive sheets, reconnect and server-restart recovery with two or more players.

For the first playable milestone, acceptance should be: a GM and player create a scene and characters, move tokens under correct permissions, roll and resolve an attack against a target, advance combat, then restart the server and recover the same saved state. The current tests do not yet cover that milestone.
