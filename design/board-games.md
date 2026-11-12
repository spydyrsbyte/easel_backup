# Playable board games

`easel.chess.game` and `easel.checkers.game` are applications using `easel.board.games`. Their server entries request `easel.board.game@1`; browser entries request `easel.board.controller@1`, which mounts the `easel.board.table@1` component. PixiJS renders the browser board. The server owns the match; browser code sends square selections, never a replacement board or player identity.

## Using the applications

Start Easel with `run-easel.easel.ps1`, sign in, and create a Chess or Checkers game in the lobby. The required board module is selected automatically. Join from two separate accounts, using separate browsers or an incognito window, and take White and Black. A third account can watch. Select a piece and then its destination. Black's view flips automatically; either player can flip the board manually.

The lobby's Manage button opens access settings, member roles, removal, and adding members. A table administrator adds a user directly; they become a player immediately and appear in the member list. Members-only tables admit only members. A member can be an administrator, player, or spectator. The creator is a game administrator; new members are players. A game administrator manages that game's members and can reset its board and seats. Spectators can read the board but cannot claim seats or move. Role assignments are authoritative attributes of game-scoped security principals, evaluated through the board module's declarative policies. These three roles are predefined; this screen does not edit security policy definitions or create custom role types.

Installation administrators can create, start, and stop games, manage every game's membership, and grant or revoke installation administrator status. Game administrator status does not grant installation administration. The last installation administrator cannot be removed through the lobby. Account signup and password/provider sign-in remain the existing account flows; the management screen does not reset passwords or delete accounts.

Match records and automations live in PostgreSQL. Refreshing or reconnecting returns the browser to its last game in that tab and restores the current board, seats, turn, and move history. The Lobby button explicitly leaves the game view; it preserves membership and seats. Reset match clears the board, seats, and history and requires game administrator authority. It is also the recovery control for an abandoned seat.

## Rules

Chess enforces alternating turns, piece ownership, captures, blocked paths, knight jumps, and ordinary pawn movement including the initial two-square move. It deliberately omits check, checkmate, castling, en passant, promotion, and draw rules. Kings can be captured; the application does not end a chess game automatically.

Checkers uses an eight-by-eight board, with White moving first. Men move and capture diagonally forward. Kings move and capture in either direction. Captures are mandatory, multiple captures continue with the same checker, and crowning ends that turn. A player wins when the opponent has no pieces or legal moves. Repetition and draw adjudication are not implemented.

## Automation integration

`easel.board.Seat` validates and saves seat assignments. `easel.board.Move` loads the match, checks its revision, validates the authenticated player's seat and turn, checks movement, applies captures and crowning, updates history and turn, saves, and emits `easel.board.changed`. `easel.board.Jumps` and `easel.board.Mobility` are nested automations for checkers. `easel.board.Reset` resets a match; its automation authorization separately requires game administrator status.

These are persisted JSON Automation definitions assembled by `server/automations.mjs`, interpreted by Go. Gameplay validation and mutation use Automation steps and expressions. JavaScript wires application events, declares the definitions, builds the initial board, and supplies presentation data. Game startup installs a PostgreSQL Automation service with explicit authorization; client-origin execution retains its principal and permissions.

Automation expressions can read trusted request metadata with `{"context":"principal"}`, `game`, `session`, or `origin`. Arguments cannot replace these values. Missing context fields fail. The JavaScript bridge supplies this context for both `run` and `command`; direct Go callers must supply an environment explicitly. Board automations take the acting user's identity from this environment rather than an argument.

Browser event deliveries and targeted `connection.send` calls are buffered until the enclosing request commits. Failed requests and failed commits discard deliveries. Internal event handlers still run in FIFO order within the request. `Users.Changed` is a server-origin runtime event that tells clients to refresh authorization-dependent presentation after a role change. Record writes still require the security policy in the transaction; UI state does not grant access.

Record types expose `Type.ids()` for discovery. The PostgreSQL implementation restricts discovery to the current game and the requested type or its subtypes, and authorizes every record read. Discovery fails if a record cannot be read. The board module uses it at startup to find its saved match.

## Frontend assets and verification

The checked-in PixiJS bundle is self-hosted by the shared `easel.graphics.pixi` kit, which exposes `easel.graphics.pixi@1` to browser packages. The board module's `table@1` component declares this dependency in its own `required`, and package composition includes required modules automatically. The bundle includes PixiJS's official `unsafe-eval` compatibility module, so script evaluation remains restricted to self-hosted files. Runtime use needs no npm install or CDN connection. To rebuild the bundle:

```powershell
npm ci
npm run build:pixi
```

The package version and transitive dependencies are pinned in `package-lock.json`; its license is alongside the bundle. The shared frontend follows the old Easel templates: a split sign-in screen, a fixed sidebar with My Games and Applications, a compact account-menu header, searchable game cards, application cards that open a create dialog, and tabbed game settings. Server user management opens through Settings in the account menu. Game sessions use the compact header with the sidebar hidden, as in the old play workspace. Narrow screens collapse the lobby sidebar to an icon rail.

```powershell
npm run test:client
$env:EASEL_PLAYWRIGHT_MODULE = (Resolve-Path node_modules/playwright/index.mjs).Path
./scripts/test-security.ps1
```

Browser tests use installed Microsoft Edge. The test runner starts an isolated PostgreSQL cluster and creates disposable databases. Board integration tests cover piece movements and blocked paths, pawn captures, checkers mandatory and multiple captures, crowning, blocked opponents, authorization, stale revisions, persisted definitions, reset, and game restart. Browser tests use independent account contexts and real PixiJS pointer input, and cover synchronized moves, reconnects, private invitations, roles, administrator assignment, and mobile width. They save review screenshots to `bin/lobby.png` and `bin/chess.png`.
