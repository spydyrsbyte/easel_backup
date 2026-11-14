# Kit UI, the virtual tabletop and the board table

This describes the second generation of browser kit components, and the two complete game interfaces assembled from them: the virtual tabletop (`easel.tabletop.game`) and the board table (chess and checkers). First-generation components that these replaced (`map@1`, `shadowbox@1`, `fog@1`, `ruler@1`, `vttworkspace@1`, `toolstrip@1`, `window@1`, `chatlog@1`, `journal@1`, `browser@1`, `directory@1`, `compendium@1`, `encounter@1`) were removed with the old Pathfinder and Magic applications. The rest of the first-generation toolbox remains and is restyled from the same tokens.

## Shared layer

Every kit carries a synced copy of two files; edit the canonical copies in `server/easel/server/library/client/` and run `node scripts/sync-kit-support.mjs`.

- `ui.mjs` — `Component` base class (`render(props, previous)`, `emit`, `slot`, abortable `on`), `h` element builder, icons, buttons, avatars, `keyed` list reconciliation, `drag`, `menu` and `contextMenu`.
- `kit.css` — one stylesheet. Tokens are `--ez-*` custom properties that inherit the lobby's `--color-*` values, so games, lobby and sign-in share a palette. Dark is the default; `:root[data-theme="light"]` switches. Components use `.ez-*` classes; the older `.kit-*` classes are restyled from the same tokens.

A component whose root sets `data-easel-fill` gets the whole area under the header (`.board-shell:has([data-easel-fill])` in the shell stylesheet).

`node scripts/register-kit-ui.mjs` is the single description of these components: it writes each contract, manifest entry, catalog entry and contract page. Add a component there, not by hand.

## Components

| Interface | What it is |
|---|---|
| `easel.layout.tabletop@1` | Full-screen frame: canvas plus overlaid tool rail, scene bar, hotbar, player list, sidebar, floating windows, toasts, turn banner. Reports the insets its overlays cover. |
| `easel.layout.gametable@1` | Board game frame: board between two seats, side panel with status and actions, result card, toasts. |
| `easel.layout.window@2` | Draggable, resizable, minimisable floating window. |
| `easel.layout.sidebar@1` | Icon-tabbed panel; each tab names the attached child it shows. Nests as a segmented control. |
| `easel.input.toolrail@1`, `hotbar@1`, `form@1` | Tool palette with shortcuts; numbered quick bar; property form built from field descriptions. |
| `easel.maps.map@2` | Battle map: layers, walls, doors, lights, line-of-sight fog, tokens, ruler, pings, drawing, and an editor with undo. |
| `easel.maps.shadowbox@2` | Layered stage: images, groups, dialogue, named toggles, and an editor. |
| `easel.maps.scenenav@1`, `layertree@1` | Scene bar; layer and element tree. |
| `easel.narrative.chat@1`, `journal@2` | Chat with roll cards and whisper modes; journal page. |
| `easel.combat.tracker@1` | Initiative order, turn, health bars. |
| `easel.collections.browser@2` | Searchable directory with folders and drag-out. |
| `easel.characters.statsheet@1` | Character sheet drawn from a layout description. |
| `easel.display.players@1`, `seat@1`, `movelist@1` | Presence list; player seat with clock and captures; numbered move record. |
| `easel.surfaces.gameboard@1` | Grid board: sliding pieces, click or drag moves, legal-move marks, keyboard play, flipped view. Any column and row count. |

Server side: `easel.maps.sight@1` (wall segments, visibility polygons, line of sight, blocked movement, grid snapping and distance) and `easel.dice.formula@1` (dice expressions with keep and drop).

## The virtual tabletop

`easel.vtt.table` (module) owns the rules-neutral table: scenes, tokens, actors, journal, chat, encounters, permissions. Its browser service `easel.vtt.tabletop@1` assembles the components above into the interface and exposes a small `system` hook object so a game supplies only what is specific to it: how to list actors, what a sheet looks like, what a roll means. `easel.tabletop.game` is the reference application: a system-neutral character sheet, demo scenes, and about sixty lines of browser code.

A game system that needs more than the layout-driven sheet uses further `system` members: `sheetComponent`, `sheetEvents`, `sheetWindow`, `sheetTitle`, `sheetOpened` and `sheetClosed` replace the sheet with its own component; `tabs` adds sidebar tabs; `drop` takes drops on the map; `actorFolders` and `actorBrowser` shape the character list; `tokenMenu` and `tokenAction` extend the token menu; `require` on `mount` loads extra interfaces. On the server, the actor hook may return `scale` for creatures larger than one square, and `tokenDeleted` is called after a token is removed. `easel.pf1e.game` uses all of these; see `pf1e.md`.

A scene is either a battle map or a stage (shadowbox). The data models follow the earlier Node prototype:

- Map: `size`, snap settings, `fogEnabled`, and `layers` of ground floors. Each ground has an image, a grid (`size`, `offset`, colour, real-world size and unit), ambient light, and child layers of type object, drawing, wall, token, light or roof. Walls are segments (optionally doors: open, locked, secret) or round columns. Tokens are separate `easel.vtt.Token` records.
- Stage: `width`, `ratio`, a tree of image, dialogue and group elements (first is in front), and `toggles` that switch sets of elements on and off with a fade.

Who sees what is decided on the server. The game master receives everything. A player receives only tokens that are not hidden and, when the application enables `lineOfSight`, only those a token they control can see; the server also refuses moves through walls and opening locked doors. The browser's fog is presentation of the same geometry.

Known limits: square grids only (the model has a grid type, hex is not drawn); wall geometry is sent to players' browsers so their fog can be drawn, which a determined player could read; layer `shape` masks and light masks from the prototype are not carried over.

## The board table

See `board-games.md`. `easel.board.controller@1` composes gametable, gameboard, seats, move list, sidebar and chat around the existing match automations.

## Working on the interface

```powershell
./scripts/dev-server.ps1 start        # private PostgreSQL + server on http://127.0.0.1:5199
node scripts/dev-shot.mjs --application easel.tabletop.game --game "Demo" --steps scripts/stories/vtt.steps.mjs
node scripts/dev-two.mjs              # two accounts: fog, permissions, doors, rolls, uploads
node scripts/dev-board.mjs            # two accounts: chess, checkers, resign, rematch, phone width
node scripts/dev-kit.mjs --story map  # one component in isolation, no server
```

Packages are snapshotted when a game starts, so restart the dev server after changing kit or module files. Screenshots land in `bin/dev/`.
