# 03A — VTT Module: Scenes, Tokens, Walls, Combat, Chat & Journals (`easel.vtt.table`)

## 1. Overview & Scope
`easel.vtt.table` (`type: "module"`, owner `easel`, host `vtt`, name `table`, records published as `easel.vtt.<Type>`) holds the virtual-tabletop records and server logic that **any** tabletop RPG or map-based game uses: scenes, tokens, walls and doors, fog of war, combat turn order, chat with roll modes, journals, folders, and per-user dice settings.

It is a **regular module** at `Easel/server/easel/modules/vtt/`. A game that wants it lists `easel.vtt.table` in its `required.modules`. It is deliberately not a global library: Easel adds every global package's records and security to every game, including Chess and the lobby, whether the game uses them or not ([`session.go`](../Easel/internal/session/session.go#L91-L118), confirmed by test on 2026-10-29).

Kits cannot declare records ([`manifest.go`](../Easel/internal/manifest/manifest.go#L385)), so these cannot live in a Kit. They are not 3.5 or Pathfinder rules, so they do not belong in `easel.wotcogl35.rules` or the PF1e application. This module composes the Kit bricks from Sections 01–03 (`easel.maps.*`, `easel.visibility.*`, `easel.turns.*`, `easel.combat.*`, `easel.dice.*`, `easel.narrative.*`, `easel.collections.*`) into records and server behavior; games plug their rules into it.

**The test:** would a game that is not d20 (GURPS, Call of Cthulhu, Blades in the Dark, a skirmish wargame) use it unchanged? If yes, it belongs here.

---

## 2. Records (`data/records.json`)
- **`Actor`**: the base record every game's actor extends (PF1e: `easel.pf1e.Actor` `.extends: "easel.vtt.Actor"`). No game rules; only `name`, `portrait`, `tokenImage`, `defaultTokenId`, and interaction roles, each a list holding any number of users:
  - `ownerUserIds` — read and write the actor, edit its default token and who has access, and control its tokens.
  - `controllerUserIds` — read the actor and control its tokens (move, rotate, roll for it), without writing its data. For example, a player's character controlling a summoned creature or an NPC companion.
  - `viewerUserIds` — read only; no token control.
  - The GM can do everything. A token with no actor is controlled only by the GM. Tokens and combatants get their roles from their actor when checked, so a role change applies immediately.
  - **These roles are game settings, not record permissions.** The server reads every record and decides from the roles what each user may do and what they are sent (`server/interaction.mjs`). The record-level security rules only separate GM, player, and spectator.
  - `defaultTokenId` points to an unplaced template `Token` (`isDefault: true`, no scene). Placing the actor copies the template, so moving a placed token never changes the default.
- **`Scene`**: `name`, `folderId`, `map` (the `easel.maps` battle-map definition: grounds, levels, and their object, wall, door, column, token, light, and roof layers, exactly as `easel.maps.map@1` edits and `easel.maps.geometry@1` reads it), `active`, `navigation`, `sort`. Walls are part of the map, not separate records, so the kit's map editor and `.map` import/export keep working.
- **`DoorState`**: `sceneId`, `wallId`, `open`. Door open/closed state lives outside the map so players can open doors without permission to edit the scene.
- **`Token`**: optional `sceneId`, `groundId`, `actorType`, optional `actorId` (a typed reference to the base Actor, accepting game subtypes), `name`, `image`, `x`, `y` (center, map pixels), `width`, `height`, `rotation`, `hidden`, `disposition` (`friendly`, `neutral`, `hostile`, `secret`), `vision` (game-defined), and `isDefault`. Interaction roles are resolved from the actor, rather than copied into the token.
- **`Combat`**: `sceneId`, `round`, `turnIndex`, `started`. One combat at a time.
- **`Combatant`**: `combatId`, `tokenId`, `actorType`, `actorId`, `name`, `hasInitiative`, `initiative`, `defeated`, `hidden`. Control is resolved from the actor when initiative is requested.
- **`ChatMessage`**: `userId`, `speakerName`, `speakerActorType`, `speakerActorId`, `speakerTokenId`, `rollMode` (`public`, `gm`, `blind`, `self`), `whisperUserIds`, `timestamp`, `text`, `card` (game-defined payload).
- **`JournalEntry`**: `name`, `folderId`, `content`, `playerVisible`.
- **`Folder`**: `name`, `kind`, `parentId`, `sort`.
- **`DiceSettings`**: `userId`, `settings` (preferences for `easel.dice.dicebox@1`).

Not built yet: per-user explored fog (`FogState`) and multi-page journals.

## 3. Server Interface `easel.vtt.table@1` (`server/table.mjs`)
A game's server code calls `Easel.Interfaces.create("easel.vtt.table@1").start(hooks)`.

- **Roles**: GM means the `administrator` game role, read from `Application.users.list()`; never from owning something.
- **Client events** (`easel.vtt.<name>`): `refresh`, `sceneCreate`, `sceneUpdate`, `sceneSaveMap`, `sceneActivate`, `sceneDelete`, `doorToggle`, `tokenCreate`, `tokenUpdate`, `tokenMove`, `tokenDelete`, `combatStart`, `combatEnd`, `combatantAdd`, `combatantRemove`, `combatantSetInitiative`, `combatantRollInitiative`, `combatantDefeated`, `combatNext`, `combatPrevious`, `chatSend`, `journalSave`, `journalDelete`, `folderSave`, `folderDelete`, `diceSave`.
- **Server → client**: `easel.vtt.state` (the viewer's projected state), `easel.vtt.error`, `easel.vtt.changed` (broadcast; clients refresh).
- **Server events for games**: `easel.vtt.turnStarted`, `easel.vtt.turnEnded`, `easel.vtt.roundStarted`.
- **Token movement**: players' moves are checked against walls and closed doors with `easel.maps.geometry@1` `movementBlocked` (80% body-radius rule); players cannot change a token's level; the GM is not blocked.
- **Doors**: anyone may open or close an unlocked door; locked doors are GM-only; to players a secret door is indistinguishable from a wall.
- **Projection**: non-GM viewers never receive hidden tokens, hidden layers or items, secret-door markers, GM-only journals, combatants marked hidden, other users' dice settings, or messages outside their roll mode. A blind roll reaches its author only as a concealed placeholder.
- **`post(message)`**: server-side API for games to add chat messages and roll cards.

## 4. Game Hooks (passed to `start`)
| Hook | Purpose |
|---|---|
| `actor(actorType, actorId)` | Returns `{ name, image, width, height, vision }` for a new token, or `null` if the actor does not exist |
| `initiative(combatant, context)` | Returns the rolled initiative number; `context.userId` identifies the authenticated user who requested it |
| `visible(userId, token, scene)` | Vision: whether a non-GM viewer sees a token (default: every token that is not hidden) |
| `cardView(card, userId, isGM, message)` | Projects a roll card for one viewer |
| `command(text, context)` | Handles chat commands such as `/roll`; returns `true` when handled |
| `sceneView(scene, userId, isGM)` | Applies the game's server-side scene/vision projection before the state is sent |
| `actorChanged()` | Notifies the game after actor access or default-token settings change |

Planned, not built: a distance-metric hook and the fog-of-war explored-area tracking.

## 5. Client Interfaces
- **`easel.vtt.scenebinder@1`**: binds `easel.maps.map@1` and `easel.maps.fog@1` to the projected scene and sends token moves, door toggles, drops, and map edits to the server.
- **`easel.vtt.combatbinder@1`**: binds `easel.combat.encounter@1` to the combat state.
- **`easel.vtt.chatbinder@1`**: binds `easel.narrative.chatlog@1` to messages, plays rolls in `easel.dice.dicebox@1` before revealing their cards, and renders cards with the game's component.
- **`easel.vtt.directorybinder@1`**: binds scene and journal directories and their editors, actor access lists, and default-token settings using Kit components.

The game's application decides the workspace layout and composes these binders with its own sheets.

## 6. Anti-Spaghetti Guardrails
1. **No Game Rules Here**: no d20, PF1e, or 3.5 terms (AC, saves, CMB, darkvision 60 ft). Games pass those in through hooks.
2. **Records Only Where Records Are Needed**: rendering and math stay in the Kits; this module holds state and the server behavior around it.
3. **Never Persist Calculated `visionMask` or `presentation`**.

## 7. Verification (`Easel/internal/session/vtt_test.go`)
- [x] Interaction access: GM-only scene edits, dynamic actor owner/controller/viewer lists, inherited Actor methods and schemas, and per-user dice settings.
- [x] Scenes, tokens, and doors: hidden tokens and hidden map content are not sent to players; moves through walls and closed doors are rejected; locked and secret doors refuse players.
- [x] Combat: initiative order, defeated combatants skipped, rounds advance and rewind, turn events reach game listeners in order.
- [x] Chat: public, GM, blind, self, and whispered messages reach exactly the right viewers.
- [x] Record-level policies under PostgreSQL (`scripts/test-security.ps1`) with the PF1e application loading the VTT module.
- [x] Client binders and a two-user browser test, including saved state after a game runtime restart.

Current implementation graph and verification commands: [PF1e/VTT integration](../Easel/design/pf1e-vtt.md).
