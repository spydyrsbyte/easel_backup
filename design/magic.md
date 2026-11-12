# Magic: The Gathering

`easel.mtg.game` ports the old `_Easel/Praxis/applications/mtg/0.1.0` application into the Go/Sobek implementation. It is a manual multiplayer tabletop and rules assistant, with the same underlying card-action, cost, combat, keyword, reset, and card-effect logic as the original. It does not implement the full Magic rules engine or automatically interpret arbitrary card oracle text.

## Play

Launch Easel with `run-easel.easel.ps1`. An installation administrator opens Applications, selects Magic: The Gathering, and starts a table. Join it from separate signed-in browser sessions. Up to eight people can take seats. Game roles control who can play or manage the table; spectators receive filtered read-only views.

The Deck panel imports quantity/name lists, including Main, Commander and Sideboard sections. Card lookup and art use Scryfall from the browser, as in the original. The lookup checkbox can be turned off to import names without network access. Scryfall search and rulings are also available. Libraries, hidden hands, sideboards, library searches and imported deck metadata stay private. The server constructs a separate filtered snapshot for each viewer; hidden information is not sent and then hidden by CSS.

The play surface uses PixiJS with the original classic playmat geometry, images and icons, plus the original whole-table and player-area layout calculations. Card selection, movement between zones, normalized battlefield positions, tapping, counters, playmat controls, whole-table/player-area views and wheel zoom are supported. The dock exposes Deck, Card, Rules, Zones, Effects, Chat, Log and Settings. Hide panels clears the play surface without losing state.

Game actions include draw, shuffle, mulligan, deck reset and removal; movement through the library, hand, battlefield, graveyard, exile, command, sideboard, stack and shared table; face-down/reveal/transform controls; attachments, tokens, copies and control changes; life, mana, poison, energy, named counters, commander tax and commander damage; phases, turn advancement, casting, timed/manual stack resolution, combat assignments, damage and rule checks. Card-event definitions remain validated data with bounded responses, preserving the original card-effect features. Starting a new game and changing table settings require game administrator authority.

The current interface uses the English catalog from the original game. The other original catalogs are included as assets. Chat is persisted with the match, and uses authenticated names supplied by the host. Refreshing, reconnecting, and restarting a game retain its cards, seats, counters, preferences, effects, decks and messages.

## Runtime integration

`easel.mtg.rules@1` is a server interface. Its implementation contains synchronous pure game logic adapted from the old server, including the grouping/reset helpers and card-effect evaluator. It calls a narrow host contract for loading state, authorization information, names, preferences, randomness, persistence, inspection delivery and scheduled events. The old board-as-server runtime, data API, operation router and component event bus are not installed.

The application maps authenticated client requests into this rules interface. Record reads and writes use the new schema and security layer. Each game has its own typed `easel.mtg.Session` record, containing the private aggregate state and an application revision. Only a filtered snapshot is returned to a browser.

`easel.mtg.Commit` is a persisted Go-interpreted Automation. Every successful game-state change loads the session in the request transaction, checks its expected application revision, replaces the validated next state produced by the trusted rules interface, increments the revision, saves, and emits `easel.mtg.changed`. The browser cannot supply an arbitrary next state or directly run this automation. Movement and Magic-specific rule decisions remain in the ported JavaScript rules code; Automation handles the atomic revision-checked state transition and notification.

`easel.mtg.table@1` is the browser component contract, including its state, response, inspection and action payloads. It requests `easel.graphics.pixi@1` from the shared self-hosted renderer kit. Package composition resolves required modules, including transitive requirements. The browser uses the existing authenticated event transport; identities are supplied by the server-side connection rather than a client action payload.

Hosted game code can read its scoped roster with `Application.users.list()`. It returns the current game's member IDs, display names and roles; it provides no account-management operations. Security decisions and the match's private state stay on the server.

`Server.events.after(name, milliseconds, payload)` schedules a server-origin event on the owning session's serialized event loop and returns a cancellation ID. `Server.events.cancel(id)` cancels it. Payloads and event origins are checked before scheduling. New timers are canceled if the enclosing request fails; cancellation of an existing timer takes effect only when the request commits. Session shutdown stops pending timers. Magic uses these events for the original six-second stack resolution timer. A restarted game rearms the timer for its current top spell.

The browser security policy permits only the Scryfall API and card-image host in addition to the existing local sources. Scripts remain self-hosted, with PixiJS's compatibility module avoiding unrestricted script evaluation.

## Verification

`TestMagicGame` runs the actual Sobek packages, PostgreSQL records, security policies and persisted Automation. It covers seating, deck import, hand privacy, ownership denial, casting, combat damage, counters, turn preferences, card effects, chat, spectators, persisted state after restart and scheduled stack resolution.

`TestMagicBrowser` uses two independent browser contexts. It exercises the Applications/create-dialog path, mocked Scryfall collection lookup, deck import, private hand delivery, a real PixiJS pointer selection, casting, stack resolution, combat, tokens, chat, reconnect and mobile width. Card-lookup tests use fixtures and do not depend on Scryfall availability. Timer tests cover failed requests and cancellation. All PostgreSQL tests use isolated temporary clusters/databases.

```powershell
npm ci
$env:EASEL_PLAYWRIGHT_MODULE = (Resolve-Path node_modules/playwright/index.mjs).Path
./scripts/test-security.ps1
npm run test:client
```

Browser tests use installed Microsoft Edge and save `bin/magic-table.png`, `bin/magic-player.png` and `bin/magic-mobile.png`. The vendored renderer can be rebuilt with `npm run build:pixi`; its license and the copied icon licenses are included beside their assets.
