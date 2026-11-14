# Easel platform completion status

Updated November 11, 2026, after the completion work. This replaces the earlier review, which listed what was missing. Scope is unchanged: the Easel platform in `Easel/`, not individual games or kits.

**Where things stand.** Every numbered item of the earlier review is built and tested except one that became unnecessary (O03). Protected packages, which the review had deferred, are also built. The work is in the git repository created in `Easel/`, one commit per block, on top of a commit of the code as it was.

**Before you run it.** This build uses a new database layout and refuses to open a database made by the previous build. Your local `easel` database must be recreated: nothing in it is converted. Alpha has no migrations, by the project's own rule.

## How to check it yourself

Run these from `Easel/`.

| Command | What it proves | Result on November 11 |
|---|---|---|
| `.\scripts\test-security.ps1` | Go suites against a temporary PostgreSQL | All 17 packages pass |
| The same with `EASEL_PLAYWRIGHT_MODULE` set | Adds browser acceptance in headless Edge, including the existing game suites | All pass |
| `.\scripts\smoke.ps1` | The three built executables on a clean database | All 15 checks pass |
| `.\scripts\test-security.ps1 -Bench . -Package ./internal/games` | Platform benchmarks | Figures in `design/operations.md` |

## What was built

| Item | Status | Where | Proof |
|---|---|---|---|
| S01–S05 Server application services | Done | `internal/games/launch.go` | `TestServerDefinitionUsesRecordsSecurityAutomationsAndFiles` |
| F01–F05 Game file storage | Done | `internal/files`, `internal/server/files.go`, `internal/jsapi/files.go` | `TestGameFilesAreStoredProtectedAndCleanedUp` |
| F06 Browser file integration | Done as a runtime helper | `Application.files.upload` and `.url` in `runtime.mjs` | `TestBrowserChallenge` |
| A01–A03 Browser sign-in challenges | Done | `session.mjs`, shell `signin` component | `TestBrowserChallenge` |
| O01, O02 Schema conversion and cleanup | Done | `easel schema`, `internal/games/migrate.go` | `TestMigrationPlansConvertAndCleanUp` |
| O03 Legacy identifier conversion | Not built, not needed | — | Databases that old cannot be opened by this build at all |
| O04 Backup and restore | Done | `easel backup`, `easel restore`, `internal/portable` | `TestBackupRestoresIntoACleanInstallation`, smoke test |
| P01–P06 Package management | Done | `easel packages`, `internal/packages`, `Server.packages` | `TestPackagesInstallUpdateAndRecover` |
| L01–L03 Suspend, resume, startup choices | Done | `internal/games/lifecycle.go` | `TestSuspendedGamesKeepTheirTimersAndReleaseTheirSlot` |
| L04 Export and import | Done | `easel export`, `easel import`, `easel accounts reassign` | `TestGameExportImportsWithMappedAccounts` |
| L05 Relocation | Done | `easel export -relocate`, `easel games release` | `TestSuspendedGamesKeepTheirTimersAndReleaseTheirSlot` |
| L06 Whole-process recovery | Done | — | `TestGamesRecoverAfterTheProcessRestarts`, smoke test |
| H01–H04 Multiple logical servers | Done | `internal/hosting`, `config/servers.json` | `TestLogicalServersShareNothing` |
| H05 One runner per game on a shared database | Done | `internal/games/ownership.go` | `TestMigrationPlansConvertAndCleanUp`, `TestLogicalServersShareNothing` |
| E01–E04 Editions and the GM limit | Done | build tags in `cmd/easel`, `scripts/build.ps1` | `TestOneGameEditionLimitsEveryServerInTheProcess`, smoke test |
| Q01–Q06 Release validation and documentation | Done | `scripts/smoke.ps1`, `design/operations.md` | Smoke test; isolation test; benchmarks |
| Protected packages (was deferred) | Done | `internal/seal`, `easel publisher`, `easel license` | `TestProtectedPackagesNeedALicenseForThisInstallation` |

## Decisions made while building

These follow your answers where you gave one. The rest are my choices; say if any is wrong.

| Decision | Choice |
|---|---|
| What is per server | Accounts, administrators, sessions, games, files, and the server application's data. Each server has its own listen address and cookie. |
| What is shared by an installation | Installed packages, update channel choices, licenses, the games folder, and the database. Three servers on one installation run the same installed package versions. |
| Suspension | Keeps records and pending timers with the time they had left. In-memory JavaScript state is rebuilt by package initialization. |
| Shutdown | A clean shutdown keeps timers like a suspension and restarts those games next time. A crash loses pending timers, not records. |
| Imported accounts | Mapped by hand or by matching username; anything unmatched becomes a placeholder that `easel accounts reassign` can hand to a real account later. |
| Editions | Go build tags. Only the GM one-game limit is enforced, and it counts games across every server in the process. Server-count limits stay contractual, as the licensing specification says. |
| Update channels | `http(s)`, `file:`, or a path. An update that saved games do not fit is refused before anything changes. |
| File uploads | Refused unless the application's `upload` hook allows them. Any member of a game can fetch a file whose id they know; the application decides who learns which id. |
| Protected packages | One license per installation per major version line, signed by the publisher, with no license server. |

## Defects found and fixed along the way

1. **Games failed each other under load.** Record transactions ran at PostgreSQL's strictest isolation level with no retry, so requests in unrelated games failed with serialization errors once several games were busy. They now use snapshot isolation with the row locks they already took. Eight busy games ran about 4,800 requests per second without a failure.
2. **Event delivery queried the database once per subscriber per event.** Membership is now cached per running game and invalidated on every change. Delivery to 50 subscribers went from 5.8 ms to 1.6 ms.
3. **The lobby hard-coded each application's name and description by package id**, so a new application showed the demo's text. Names and descriptions now come from the manifest (`title`, `description`).
4. **README pointed at a launcher and two design files that do not exist.** Corrected.

## What is not done

| Gap | Detail |
|---|---|
| No administration screens for the new features | Packages, updates, modules, licenses, backups, and migrations are commands and `Server` APIs. The lobby gained only a Suspend button and state labels. |
| No ready-made upload component | Applications get `Application.files.upload` and build their own control. A kit component for it would fit the building-block model. |
| Server application timers are not kept across restarts | Game timers are. |
| Protected packages cannot stop a determined licensed operator | Content a game sends to browsers reaches the players, and a licensed installation decrypts in its own memory. Unlicensed copies do not run and every working copy names its licensee. This is stated in `design/operations.md` section 10, in words you can show a publisher. |
| Most commands are tested through their Go functions, not as commands | The smoke test runs `version`, `games`, `backup`, `restore`, and `packages list` as real commands. `schema`, `export`, `import`, `accounts`, `files`, `license`, `publisher`, and the other `packages` commands are thin wrappers over tested functions and were not run end to end. |
| A successful upload was not driven from a real browser | The browser test covers the upload helper being refused and its addresses; accepted uploads are tested over HTTP. |
| Benchmarks cover the request path only | Not WebSocket fan-out to real browsers, and not reconnect storms. |
| Scripts are Windows PowerShell | The Go code is portable; the build, test, and smoke scripts are not. |
| Not audited | The thirty kit libraries, the game applications, and the PF1E work were outside this review and I did not check them against the kit model. |

Still out of scope, as before: native Android clients, TV mode, authoring editors, untrusted-package sandboxing, offline queues, and account recovery or deletion.

## Things about the design worth your attention

- **Two spellings of the component property API.** The browser runtime accepts both `props`/`setProps` and `properties`/`setProperties`, and the shell uses one while the lobby uses the other. Pick one before kit authors learn both.
- **`Games` and `Server.games` are the same object** under two global names in the server application.
- **The demo applications named for Magic: The Gathering** use another company's game and name. If publishers are going to trust Easel with their games, that is worth removing from what you ship.

## Interface pass (2026-11-12)

Second-generation kit components, the Easel Tabletop virtual tabletop, and a new chess and checkers table were built on top of the platform work above. See `Easel/design/kit-ui.md` and `Easel/design/board-games.md`.

Verified on 2026-11-12: Go suites (all packages), browser acceptance for board, Pathfinder and Magic, 182 kit unit tests, 154 browser-mounted kit components, `scripts/smoke.ps1`, and the two-account walkthroughs `scripts/dev-two.mjs` and `scripts/dev-board.mjs`.

Still open: Pathfinder and Magic use the first-generation components; hex grids are not drawn; wall geometry reaches players' browsers; chess lacks check, checkmate, castling and en passant; no automated acceptance test for the tabletop application in the Go suite (only the dev walkthroughs).
