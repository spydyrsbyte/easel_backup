# 08 — PF1e Application: Game, VTT Records, Sheets & Workspace (`easel.pf1e.game`)

## 1. Overview & Scope
This section covers the rest of the PF1e application, the parts a player actually sees and uses:
- **Server game & session** (`server/application.mjs` and the files it imports): event registration, per-viewer state, roll handling, and automation calls.
- **Using `easel.vtt.table`** (Section 03A): the generic module that holds scenes, tokens, walls, fog, combat turn order, chat, journals, folders, and dice settings. The application only supplies PF1e-specific hooks.
- **Sheets**: the PF1e character sheet and NPC sheet, composed from Kit bricks, the shared `easel.wotcogl35.*` panels, and PF1e panels.
- **Workspace controller** (`client/application.mjs` and the files it imports): mounts the VTT workspace and wires every brick to the server.
- **Manifest** and end-to-end verification.

An application owns the game's rules, wiring, and persistence ([`Easel/design/manifest.md`](../Easel/design/manifest.md#L124)). The entry files are ordinary entry points that import the application's own files; they are not one-line wrappers. Files inside the application import each other with relative paths; other packages are reached only through interfaces.

---

## 2. What It Is Pulling & Where From

| Piece | Source Reference in Workspace | How It Fits |
|---|---|---|
| Application structure | [Easel/server/easel/applications/mtgtable/](../Easel/server/easel/applications/mtgtable) | A full application with its own `data`, security, server rules, and client code. |
| Existing code to move | `Easel/server/easel/modules/pf1e/server/game.mjs`, `session.mjs`, `client/controller.mjs`, `charactersheet.mjs`, `npcsheet.mjs`, `client/parts/` | Moves into `applications/pf1e/`; shared panels split out to `easel.wotcogl35.rules` (Section 06). |
| Foundry sheet layout | `_referenceOnly/Data/systems/pf1/public/templates/actors/` | Reference for the 11-tab character sheet and the NPC sheet modes. |
| VTT bricks | Sections 01–03 | `vttworkspace@1`, `toolstrip@1`, `map@1`, `fog@1`, `template@1`, `dicebox@1`, `dicesettings@1`, `rollcard@1`, `chatlog@1`, `richtext@1`, `directory@1`, `compendium@1`, `encounter@1`, `window@1`, `tabs@1`. |

---

## 3. How to Build Each Piece

### 3.1 VTT Records
The application declares no VTT records. Scenes, tokens, walls, fog, combat, chat, journals, folders, and dice settings come from `easel.vtt.table` (Section 03A), and the d20 hooks come from `easel.wotcogl35.rules` (Section 06). The application adds only PF1e-specific behavior on top, such as PF1e illusion and stealth overrides.

### 3.2 Server Game & Session
1. Registers PF1e vision presets and hindrances (from `easel.wotcogl35.rules`) with `easel.maps.vision@1` and `easel.visibility.projection@1`.
2. Registers application events for rolls (ability, save, skill, initiative, attack/full attack, spell, concentration, caster level, maneuver), sheet edits, record saves and deletes, actor creation/duplication/deletion, and statblock import. Scene, token, wall, combat, chat, and dice-settings events belong to `easel.vtt.table`.
3. **Rolls are authoritative and honest**: every roll uses `easel.dice.roller@1` / `easel.d20.check@1` and the actor's derived stats; formulas, crit ranges, save DCs, and damage types come from the records. Missing data produces an error the user sees, never an invented value.
4. **Roll cards** name the speaker by actor name, carry the die faces for `easel.dice.dicebox@1`, and carry the targets so "Apply Damage" works from chat.
5. **Roll modes** `public`, `gm`, `blind`, and `self` are enforced in what each viewer is sent.
6. **GM role** comes from the game's membership roles, not from actor ownership.
7. Per-viewer state projection uses the shared security rules and fog of war; unseen tokens and unrevealed areas are never sent.

### 3.3 Character Sheet (`client/charactersheet.mjs`)
A floating `easel.layout.window@1` with `easel.layout.tabs@1` and the 11 PF1e tabs:
1. **Summary**: portrait, name, race, class/level summary, XP, Rest, vitality, defenses, speeds, initiative, quick actions.
2. **Attributes**: `easel.wotcogl35.abilitiespanel@1`, plus senses and resistances.
3. **Combat** (PF1e panel): BAB, initiative, CMB/CMD and maneuver bonuses, categorized actions with Attack / Full Attack opening `easel.d20.rolldialog@1`.
4. **Inventory**: `easel.wotcogl35.inventorypanel@1`.
5. **Feats & Features**: `easel.wotcogl35.featurespanel@1`, plus PF1e traits and the Add Level flow (`pf1e.AddClassLevel`).
6. **Skills** (PF1e panel): the 35 skills and sub-skills from `skillDefinitions()`, ranks, class skill, ACP, totals with breakdowns, Take 10/20, rank budget, background skills.
7. **Spellbooks**: `easel.wotcogl35.spellbookspanel@1`.
8. **Buffs**: `easel.wotcogl35.buffspanel@1`.
9. **Biography**: `easel.narrative.richtext@1`.
10. **Notes**: player notes and, for GMs only, GM notes.
11. **Settings** (PF1e panel): wounds & vigor, background skills, fractional base bonuses, custom HP formula, vision override.

### 3.4 NPC Sheet (`client/npcsheet.mjs`)
- **Full**, **Lite** (compact combat statblock), and **Loot** (players transfer items and coins via `wotcogl35.TransferItem` / `TransferCoin`) modes.
- "Import Statblock" opens the importer from Section 07.
- Compact views for `Trap`, `easel.pf1e.Haunt`, and `easel.pf1e.Vehicle`.

### 3.5 Workspace Controller (`client/`)
1. Mounts `easel.layout.vttworkspace@1` with the map (`easel.maps.map@1`) on the canvas and the 3D dice overlay (`easel.dice.dicebox@1`) above it.
2. **Map, combat, and chat**: composes `easel.vtt.scenebinder@1`, `easel.vtt.combatbinder@1`, and `easel.vtt.chatbinder@1` (Section 03A) with the map, encounter, chat log, and dice box bricks.
3. **Sidebar tabs**: Chat, Combat, Actors / Items / Scenes / Journals (`directory@1` with folders), Compendium (`compendium@1`), Dice (`dicesettings@1`).
4. **Roll flow**: handled by `easel.vtt.chatbinder@1`, which plays the dice before revealing the d20 roll card.
5. **Targeting**: the selected tokens are the targets for "Apply Damage" and for attacks.
6. Opens character sheets, NPC sheets, and `easel.wotcogl35.recordeditor@1` windows from the directories and sheets.

### 3.6 Manifest (`applications/pf1e/manifest.json`)
Uses Easel's real manifest format ([`Easel/design/manifest.md`](../Easel/design/manifest.md)):
- `server.application`: `{ entry: "server/application.mjs", required: { modules: ["easel.vtt.table", "easel.wotcogl35.rules"], interfaces: [...] } }` listing the Core and `easel.d20.*` server interfaces it uses.
- `server.security`: the application's security entry for its own record types.
- `server.data`: the PF1e records and `.modify` declarations (Section 07).
- `client.application`: `{ "http-entry": "client/application.mjs", required: { modules: ["easel.vtt.table", "easel.wotcogl35.rules"], interfaces: [...] } }` listing the Core, `easel.d20.*`, `easel.vtt.*`, and `easel.wotcogl35.*` client interfaces it uses.
- `client.assets`: `{ "http": ["client/"] }`.

---

## 4. Recommended Build Order
1. **Sections 01–04**: Core Kits and `easel.d20.kit` (mostly built; refine as gaps appear).
2. **Section 03A**: create `modules/vtt/` (`easel.vtt.table`) with the VTT records, server behavior, and binders, and move chat storage out of `modules/pf1e/`.
3. **Section 05**: create `modules/wotcogl35/` with the shared records and security, moved out of `modules/pf1e/`.
4. **Section 06**: move the shared layers, rules config, vision, automations, and shared panels into `modules/wotcogl35/`, and add its hooks into `easel.vtt.table`.
5. **Section 07**: move the PF1e-only records, layers, statblock importer, and automations into `applications/pf1e/`.
6. **Section 08**: move the game, session, sheets, and controller into `applications/pf1e/` and compose the `easel.vtt.*` binders.
7. Delete `modules/pf1e/`.

### 4.1 Known Defects to Fix During the Move
Found in the current `modules/pf1e` code (review of 2026-10-29):
- Rolls use invented fallbacks (`1d8+4`, `1d8+3` damage, spell DC `10 + level + 3`, identify `+5` vs DC 20), `Math.random` instead of the dice kit, damage type guessed from weapon names, and `catch {}` blocks that hide failures.
- Roll card speakers show the actor ID instead of the name; `/r` chat rolls show "undefined" dice chips.
- "Apply Damage" on chat cards has no target and always fails.
- Equip, unequip, concentration, and caster-level buttons send events the server does not handle.
- `Race` and `Class` cannot be created, so BAB and saves are typed in by hand.
- GM and blind roll modes are offered but not supported.
- Deleting an actor and importing a statblock are not implemented.
- GM status depends on owning an actor.
- The battlemap is not bound to any scene, tokens, or walls; the combat tracker and compendium are empty.

---

## 5. Anti-Spaghetti Guardrails for Section 08
1. **Compose, Don't Rebuild**: sheets and the controller mount Kit bricks and shared panels; never rewrite DOM that a Kit or the shared module already provides.
2. **Never Roll Dice or Compute Derived Stats on the Client**.
3. **VTT Chrome Belongs in Kits**: window dragging, sidebar collapsing, and hotbar slots belong to `easel.layout.vttworkspace@1`; the controller configures and fills its slots.
4. **No Browser Storage for Game State**: everything that must persist is a record.

---

## 6. End-to-End Verification Checklist
- [ ] `go test ./...` passes with `easel.pf1e.game`, `easel.vtt.table`, `easel.wotcogl35.rules`, `easel.d20.kit`, and all Core Kits registered.
- [ ] Creating a PF1e game boots the workspace, mounts the battlemap with the active scene, initializes the 3D dice, and fills the sidebar directories.
- [ ] Creating a character with a race and class levels computes all derived stats (AC, touch, flat-footed, CMB, CMD, saves, skills, spell DCs, iteratives) without manual entry.
- [ ] Every check, attack, save, and spell rolls on the server, animates the 3D dice, and posts a card naming the actor; "Apply Damage" applies to the targeted tokens.
- [ ] Importing a Paizo statblock creates a working NPC.
- [ ] Token movement respects walls and doors, and non-GM players never receive unseen tokens, unrevealed areas, GM notes, or unidentified item secrets.
- [ ] Everything survives a server restart and a browser reload.
