# 00 — Architecture & Anti-Spaghetti Guardrails

> **Purpose:** Every LLM session working on any section of the PF1e project MUST read this file first before writing or editing code. These rules exist to prevent the codebase from drifting into a monolithic, Foundry-style, or tightly-coupled spaghetti mess.

---

## 1. The Lego Construction Hierarchy

Easel separates every piece of functionality into **three strict package tiers** ([`Easel/design/manifest.md`](../Easel/design/manifest.md)):

| Tier | Manifest `type` | Role in Lego Analogy | Allowed Contents | Forbidden Contents |
|---|---|---|---|---|
| **Kit** | `"kit"` | **Bin of individual bricks** | Versioned `interfaces` and `implements` only (`@1`), lazy-loaded per member (`file` / `http-entry`). | **NO** `data` schemas, **NO** `security` entries, **NO** `application` entries, **NO** general `library` startup code, **NO** automations, **NO** database reads/writes, **NO** `Application.events.emit`. |
| **Module** | `"module"` | **A Lego Set shared by more than one game** | `data` schemas, `security` policies, record layers, automations, server/client `interfaces`, and `library` entries for rules that several games share. | **NO** `application` entry, **NO** cross-package file imports, **NO** bypassing Kit bricks for generic math/UI, **NO** rules or UI that only one of its games uses. |
| **Application** | `"application"` | **The game itself** | Everything specific to that game: its own `data` (new record types and `.modify` additions to module types), record layers, security, automations, server game/session code, sheets, controller, content, and wiring. Built from Kit bricks and Module sets, following the same Lego rules. | **NO** generic bricks that belong in a Kit, **NO** rules shared with another game that belong in a Module. |

[`Easel/design/manifest.md`](../Easel/design/manifest.md#L124) is the authority: an application "owns the game's rules, wiring and persistence." **An application is not a thin wrapper.** The 1–3 line entry files in `applications/chess` and `applications/checkers` exist only because the `easel.board` kit runs the whole game, which does not fit Easel's kit model. Do not copy that pattern. [`applications/mtgtable`](../Easel/server/easel/applications/mtgtable/manifest.json) is the better model.

### 1.1 Where a PF1e piece goes

| Question | Answer → Package |
|---|---|
| Is it useful to any RPG or tabletop game (window, chat log, dice box, map, stacking math)? | Core Kit (`easel.*`, Sections 01–03) |
| Is it a record or server behavior any tabletop game would use (scenes, tokens, walls, fog, turn order, chat, journals, folders, dice settings)? | Module **`easel.vtt.table`** (Section 03A) |
| Is it a stateless calculator or widget shared by d20/WotC-derived games (ability mods, AC, Vancian slots)? | Non-core Kit `easel.d20.kit` (Section 04) |
| Does it also hold under **D&D 3.5** rules (records, stacking table, conditions, encumbrance, iteratives, spellbooks, automations)? | Module **`easel.wotcogl35.rules`** (Sections 05–06) |
| Is it **Pathfinder 1e only** (35-skill list, CMB/CMD, traits, favored class bonuses, death at negative Con, Paizo statblocks, PF1e sheets, the workspace layout, game/session wiring)? | Application **`easel.pf1e.game`** (Sections 07–08) |

When a rule exists in both games but differs in detail, the shared mechanism goes in `easel.wotcogl35.rules` and the game supplies the specific values (skill list, death threshold, concentration formula) through its own data and record layers.

---

## 2. Hard Anti-Spaghetti Rules (Never Violate)

1. **No Cross-Package File Imports (`import ... from "../../..."`)**:
   - Every relative `import` MUST stay inside its own package root ([`Easel/design/manifest.md`](../Easel/design/manifest.md#L150-L152)).
   - Packages reach other packages **exclusively** through `Easel.Interfaces.create("owner.host.member@1")` (server) and `Easel.Components.create("owner.host.member@1", ...)` (client).
   - Shared low-level validation/DOM helpers inside Core Kits live canonically in `Easel/server/easel/server/library/game/` and `client/` and are synchronized via `node scripts/sync-kit-support.mjs`.

2. **No `@2` Versions During Alpha**:
   - Easel is in alpha. Do **not** create `@2` interfaces or components (`stacking@2`, `derived@2`, etc.).
   - If an existing `@1` brick needs a richer contract for real-world use, **modify the `@1` contract and implementation in-place** and update its tests in `catalog.json`.
   - If a capability is genuinely a distinct tool rather than the same brick, give it its **own distinct member name at `@1`**.

3. **No Comments in Alpha Code & No SQL Migrations**:
   - Per [`Easel/AGENTS.md`](../Easel/AGENTS.md): **Do not add comments to code** unless explicitly asked.
   - **Do not create numbered or timestamped SQL migration files**. Edit [`Easel/server/easel/database/schema.sql`](../Easel/server/easel/database/schema.sql) directly when database schema changes are needed.

4. **Server Kit Bricks Are Pure Functions Over Caller Values**:
   - A server Kit brick (`easel.dice.*`, `easel.effects.*`, `easel.characters.*`, `easel.d20.*`) takes plain JSON-compatible values, validates them, and returns a new value without mutating its inputs.
   - Server Kit bricks **never** load or save `Easel.Record` instances, check `Application.security`, or emit network events.

5. **Client Kit Bricks Are Pure View + Local Intent Components**:
   - A browser component (`Easel.Components`) owns its root DOM `this.element` (or PixiJS canvas inside `this.element`), updates solely via `update(props)`, exposes named `slots`, and reports user actions solely via `this.onEvent(name, payload)` (`this.emit(...)` on `Base`).
   - Browser Kit bricks **never** call `Application.events.emit`, never fetch from the server directly, and never reach into parent/sibling DOM elements.

6. **First-Class Schemas — Never Stuff Non-Items into `Item`**:
   - Foundry VTT forced `Race`, `Class`, `Feat`, `Spell`, `Buff`, and `Attack` into `Item` only because Foundry lacked custom document types.
   - In Easel, `Item` is strictly for **physical gear** (`Weapon`, `Armor`, `Shield`, `WondrousItem`, `Consumable`, `Container`, `Loot`, `Implant`). `Race`, `Class`, `ClassLevel`, `Feature` (`Feat`, `ClassFeature`, `Trait`, `RacialTrait`), `Spellbook`, `Spell`, `Buff`, and `Action` are separate first-class record types.

7. **Viewer Projection Is a Security Boundary**:
   - Never persist calculated `visionMask` or `presentation` fields to database records.
   - Never send unseen tokens, unrevealed map areas, GM notes, or `identified: false` item true names/descriptions/auras/curses to unauthorized clients.

---

## 3. Section Roadmap & Build Order

| Section File | Concern Tier | Package(s) Touched | Summary |
|---|---|---|---|
| **[01-Core-Kits-Rules-And-Resources.md](01-Core-Kits-Rules-And-Resources.md)** | 1 (Core Kits) | `easel.effects`, `easel.characters`, `easel.rules`, `easel.resources` | Refine `stacking@1` and `derived@1` in-place; add `formula@1` and `charges@1`. |
| **[02-Core-Kits-Pixi-Battlemap-And-Vision.md](02-Core-Kits-Pixi-Battlemap-And-Vision.md)** | 1 (Core Kits) | `easel.maps`, `easel.visibility`, `easel.graphics.pixi` | Refine `map@1`, `geometry@1`, `vision@1`, `fog@1`, `projection@1` using PixiJS v8 + `_Easel` multi-level battlemaps, walls/doors/columns, and hindrance/illusion vision; add `template@1`, `shadowbox@1`, `worldmap@1`. |
| **[03-Core-Kits-VTT-Workspace-Dice3D-And-UI.md](03-Core-Kits-VTT-Workspace-Dice3D-And-UI.md)** | 1 (Core Kits) | `easel.layout`, `easel.dice`, `easel.narrative`, `easel.collections` | Add `vttworkspace@1`, `toolstrip@1`, `dicebox@1` & `dicesettings@1` (*Dice So Nice!* 3D dice), `rollcard@1`, `chatlog@1`, `richtext@1`, `directory@1`, `compendium@1`. |
| **[03A-VTT-Module-Scenes-Tokens-Combat-Chat.md](03A-VTT-Module-Scenes-Tokens-Combat-Chat.md)** | 1A (VTT Module) | `easel.vtt.table` | Scene, token, wall, fog, combat, chat, journal, folder, and dice-settings records, their server behavior, and client binders, usable by any tabletop game. |
| **[04-D20-Kit.md](04-D20-Kit.md)** | 2 (Non-Core Kit) | `easel.d20.kit` | Build the standalone WotC/d20-derivative Kit: 9 server calculators and 7 browser UI widgets. |
| **[05-WOTCOGL35-Module-Schemas-And-Security.md](05-WOTCOGL35-Module-Schemas-And-Security.md)** | 3 (Shared 3.5/PF1e Module) | `easel.wotcogl35.rules` | Declare the record types and security shared by D&D 3.5 and PF1e. |
| **[06-WOTCOGL35-Module-Rules-Layers-And-Automations.md](06-WOTCOGL35-Module-Rules-Layers-And-Automations.md)** | 3 (Shared 3.5/PF1e Module) | `easel.wotcogl35.rules` | Shared record layers, bonus stacking, derived stats, conditions, encumbrance, attacks, spellcasting, vision presets, automations, and shared sheet panels and record editor. |
| **[07-PF1E-Application-Rules-And-Records.md](07-PF1E-Application-Rules-And-Records.md)** | 4 (PF1e Application) | `easel.pf1e.game` | PF1e-only records and `.modify` additions, PF1e rule layers (skills, CMB/CMD, traits, favored class, death threshold), PF1e automations, the Paizo statblock importer, and PF1e content. |
| **[08-PF1E-Application-Game-Sheets-And-Workspace.md](08-PF1E-Application-Game-Sheets-And-Workspace.md)** | 4 (PF1e Application) | `easel.pf1e.game` | Server game/session, PF1e hooks into `easel.vtt.table`, character and NPC sheets, the workspace layout, manifest, and end-to-end verification. |

### 3.1 Current code vs. this plan
The existing code under `Easel/server/easel/modules/pf1e/` (`easel.pf1e.rules`) predates this split. Its shared pieces move to a new `modules/wotcogl35/` package (`easel.wotcogl35.rules`); its PF1e-only pieces, the sheets, the controller, and `server/game.mjs` / `server/session.mjs` move into `applications/pf1e/`. Chat storage moves to the new `modules/vtt/` package (`easel.vtt.table`), which also gains the scene, token, wall, and combat records that do not exist yet. The `easel.pf1e.rules` module is then removed.
