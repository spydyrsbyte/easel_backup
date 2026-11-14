# 03 — Core Kits: VTT Workspace Layout, 3D Dice (`Dice So Nice!`), & RPG UI Bricks

> **Concern Tier:** 1 — Core Generic RP Kits (`Easel/server/easel/server/library/layout`, `dice`, `narrative`, `collections`)
> **Prerequisite Reading:** [`00-Architecture-Guardrails.md`](00-Architecture-Guardrails.md)

---

## 1. Overview & Purpose

A Foundry-style VTT workspace layout (center canvas, left toolstrip, bottom macro hotbar, right collapsible tabbed sidebar, floating windows layer), 3D physics-animated polyhedral dice (*Dice So Nice!*), interactive roll/chat logs, rich text with inline roll enrichers, and searchable directories/compendia are useful in **every** tabletop RPG.

This section adds those generic bricks to the Core Kits so that no game application (including PF1e) ever has to build its own VTT shell or 3D dice renderer.

---

## 2. What It Is Pulling & Where From

| Target Brick | Source / Reference to Pull From | What to Pull & Adapt |
|---|---|---|
| `easel.layout.vttworkspace@1` & `easel.layout.toolstrip@1` | [`_referenceOnly/Data/systems/pf1/pf1.css`](../_referenceOnly/Data/systems/pf1/pf1.css)<br>[`Easel/server/easel/server/library/layout/`](../Easel/server/easel/server/library/layout/catalog.json) | Responsive VTT screen container with named slots (`canvas`, `tools`, `hud`, `hotbar`, `sidebar`, `diceoverlay`, `windows`) and collapsible sidebar toggle; `toolstrip@1` provides the left-hand layer/tool selector (`select`, `measure`, `template`, `wall`, `door`, `light`, `draw`, `calibrate`). |
| `easel.dice.dicebox@1` & `easel.dice.dicesettings@1` | [`_referenceOnly/Data/modules/dice-so-nice/`](../_referenceOnly/Data/modules/dice-so-nice/module.json) (`main.js`, `api.js`, `textures/`, `sfx/`, `templates/`)<br>[`Easel/server/easel/server/library/dice/`](../Easel/server/easel/server/library/dice/catalog.json) | 3D polyhedral dice overlay (`d2`, `d4`, `d6`, `d8`, `d10`, `d100`, `d12`, `d20`) with customizable colorsets, textures, materials (plastic, metal, wood, glass, iridescent), collision SFX, and deterministic physics trajectories that land on the server-authoritative faces returned by `easel.dice.roller@1`. |
| `easel.dice.rollcard@1` | [`_referenceOnly/Data/systems/pf1/templates/chat/roll-ext.hbs`](../_referenceOnly/Data/systems/pf1/templates/chat/roll-ext.hbs)<br>[`_referenceOnly/Data/systems/pf1/templates/dice/tooltip.hbs`](../_referenceOnly/Data/systems/pf1/templates/dice/tooltip.hbs) | Expandable roll result widget displaying roll title/flavor, formula, total badge (with crit/fumble styling), individual die faces, and collapsible modifier breakdown slot (`easel.rules.modifierlist@1`). |
| `easel.narrative.chatlog@1` | [`_Easel/docs/RPGKIT_INTERFACES.md`](../_Easel/docs/RPGKIT_INTERFACES.md) (`rpgkit.history`)<br>[`Easel/server/easel/server/library/narrative/`](../Easel/server/easel/server/library/narrative/catalog.json) | Scrollable RPG chat & roll history stream with speaker/portrait headers, roll mode selector (`public`, `gmroll`, `blindroll`, `selfroll`), filter search bar, chat input box, and dynamic item slots for `rollcard@1` / custom action cards. |
| `easel.narrative.richtext@1` | [`_Easel/docs/RPGKIT_INTERFACES.md`](../_Easel/docs/RPGKIT_INTERFACES.md) (`rpgkit.notes`)<br>[`_referenceOnly/Data/systems/pf1/help/en/Enrichers.md`](../_referenceOnly/Data/systems/pf1/help/en/Enrichers.md) | Sanitized Markdown/rich-text viewer and editor supporting inline interactive enricher tokens (e.g., `[[/r 1d20+5]]`, `@Condition[shaken]`, `@Save[fort dc=15]`) that render as clickable badges and emit `enricherClick` local events, plus optional dual `identified` / `unidentified` sections for GMs. |
| `easel.collections.directory@1` & `easel.collections.compendium@1` | [`_referenceOnly/Data/systems/pf1/templates/internal/item-search.hbs`](../_referenceOnly/Data/systems/pf1/templates/internal/item-search.hbs)<br>[`categorized-item-picker.hbs`](../_referenceOnly/Data/systems/pf1/templates/widgets/categorized-item-picker.hbs) | `directory@1`: collapsible nested folder + entity tree with search, create/delete/duplicate context requests, and drag-start payloads. `compendium@1`: virtualized, multi-filter (category, tags, level/CR range, text search) browser for large OGL reference packs. |

---

## 3. How to Build Each Piece

### 3.1 `easel.layout.vttworkspace@1` & `easel.layout.toolstrip@1`
- **Files**:
  - `Easel/server/easel/server/library/layout/interfaces/vttworkspace.json` & `client/vttworkspace.mjs`
  - `Easel/server/easel/server/library/layout/interfaces/toolstrip.json` & `client/toolstrip.mjs`
- **Contract (`vttworkspace@1`)**:
  - `properties`: `{ sidebarOpen: Boolean (default true), sidebarWidth: Integer (default 340), activeTool: String (default "select"), gmMode: Boolean (default false) }`
  - `slots`: `{ canvas: {}, tools: {}, hud: {}, hotbar: {}, sidebar: {}, diceoverlay: {}, windows: {} }`
  - `events`: `{ toggleSidebar: { payload: { open: "Boolean" } } }`
- **Behavior**: Full-bleed viewport (`position: relative; width: 100%; height: 100%; overflow: hidden`) where `canvas` fills the background, `diceoverlay` sits above the canvas with `pointer-events: none` (except when interacting), `tools` docks top-left, `hud` floats over selected token coordinates, `hotbar` docks bottom-center, `sidebar` docks right with collapse button, and `windows` holds movable `easel.layout.window@1` instances.

### 3.2 `easel.dice.dicebox@1`, `easel.dice.dicesettings@1`, & `easel.dice.rollcard@1`
- **Files**:
  - `Easel/server/easel/server/library/dice/interfaces/dicebox.json` & `client/dicebox.mjs`
  - `Easel/server/easel/server/library/dice/interfaces/dicesettings.json` & `client/dicesettings.mjs`
  - `Easel/server/easel/server/library/dice/interfaces/rollcard.json` & `client/rollcard.mjs`
  - Copy approved texture/SFX assets from `_referenceOnly/Data/modules/dice-so-nice/` into `Easel/server/easel/server/library/dice/client/assets/` and expose via `assets.http`.
- **Contract (`dicebox@1`)**:
  - `properties`: `{ rolls: Array (list of {id, dice: [{sides, value, label?}], theme?, sound?: Boolean}), enabled: Boolean (default true), quality: String (default "high") }`
  - `events`: `{ settled: { payload: { rollId: "String" } }, clear: { payload: {} } }`
- **Determinism Rule**: `dicebox@1` **never** generates random numbers on the client. It receives the exact face `value` rolled by the server's `easel.dice.roller@1` (`Easel.Random`) and pre-solves/orients the 3D die mesh so that when the physics animation settles, the top face matches `value`, then emits `settled` with `{rollId}`.

### 3.3 `easel.narrative.chatlog@1` & `easel.narrative.richtext@1`
- **Files**:
  - `Easel/server/easel/server/library/narrative/interfaces/chatlog.json` & `client/chatlog.mjs`
  - `Easel/server/easel/server/library/narrative/interfaces/richtext.json` & `client/richtext.mjs`
- **`chatlog@1`**: Accepts `messages: Array`, `rollMode: String`, `canClear: Boolean`, renders message headers (speaker, timestamp, whisper/blind badge), provides a slot or inline rendering for `rollcard@1` entries, and emits `sendMessage` (`{text, rollMode}`), `rollModeChanged`, `cardAction` (`{messageId, actionId, payload}`).
- **`richtext@1`**: Renders formatted prose safely (using DOM construction / sanitization, never raw `innerHTML` of untrusted strings) and parses `@Tag[target]{label}` and `[[/r formula]]` tokens into clickable `<button class="kit-enricher">` pills that emit `enricherActivate` (`{kind, target, formula}`).

### 3.4 `easel.collections.directory@1` & `easel.collections.compendium@1`
- **Files**:
  - `Easel/server/easel/server/library/collections/interfaces/directory.json` & `client/directory.mjs`
  - `Easel/server/easel/server/library/collections/interfaces/compendium.json` & `client/compendium.mjs`
- **`compendium@1`**: Renders only the visible viewport slice (virtualized scrolling) so compendium packs with 2,000+ spells or feats scroll at 60fps and emit `select`, `inspect`, and `dragStart` (`{packId, entryId}`).

---

## 4. Anti-Spaghetti Guardrails for Section 03

- **DO NOT** generate random dice results on the client in `dicebox@1`. All randomness comes from the server (`Easel.Random` / `easel.dice.roller@1`); `dicebox@1` is strictly a visual presenter of server-provided results.
- **DO NOT** hardcode PF1e tabs or PF1e roll types (`"cmb"`, `"fort"`, `"spellbook"`) into `vttworkspace@1`, `chatlog@1`, `rollcard@1`, `richtext@1`, `directory@1`, or `compendium@1`.
- **DO NOT** insert unsanitized HTML via `innerHTML` in `richtext@1` or `chatlog@1`. Use the safe DOM helpers in `./safe.mjs`.
- **DO NOT** call `Application.events.emit` inside any of these components; emit declared local component events (`this.emit(...)`).

---

## 5. Verification

```powershell
node --test scripts/test-kits.mjs scripts/test-client.mjs
go test ./internal/session -run Kit
node scripts/test-kit-browser.mjs
```
Every new component must be added to its Kit's `manifest.json` and `catalog.json` so `test-kit-browser.mjs` mounts, updates, exercises events, and destroys it in headless Edge.
