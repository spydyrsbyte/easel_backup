# Easel

A Go server for hosting independent game sessions, built so that games are assembled from kits and libraries. The architecture and licensing specifications live in [design](design/). To install, configure, back up, update, and host Easel, read [Running Easel](design/operations.md).

Requires Go 1.26 or newer. Game sessions use the embedded Sobek JavaScript engine (a Goja fork with ES module support).

## Run

```powershell
.\run-easel.ps1
```

The launcher starts the bundled local PostgreSQL instance when needed, then runs Easel with `server/` as its working directory. When Easel exits, including Ctrl+C, it gracefully stops PostgreSQL if it started that instance. An already-running instance or a remote database is left running. The server connects to PostgreSQL and listens on `127.0.0.1:5000`. Open that address to sign in or create an account. Signing in opens the lobby, which lists the games. The first person to connect while there is no administrator becomes one, and administrators can create, start, and stop games in the lobby. The header's Lobby button leaves a game. The bundled demonstration table loads two kits, one of which provides an alternate button implementation, and an application. Its roll button exchanges application events with the Sobek game runtime. Press Ctrl+C to shut down gracefully. Change the address with `.\run-easel.ps1 -addr 127.0.0.1:9090`.

Frontend resources are ordinary files under `server/easel/`. `templates/index.html` contains only an empty mount point and the loader. `modules/loader.mjs` starts `modules/session.mjs`, which builds the sign-in shell through the manifest-declared component kit in `modules/shell/`. Header, sign-in and account creation, provider links, status, retry, and sign-out are managed components available before authentication. The authenticated game shares their interface registry and component manager and mounts inside the shell's declared game slot. Styles remain in `templates/css/style.css`. These files are read on each HTTP request; edit them and refresh without recompiling Go or restarting the server. Only the declared shell client resources are public; game resources still require authentication and game access. `-easel-dir` overrides the default `easel` directory relative to the server's working directory. Ship the `server/` tree with the executable.

The demo's package manifests, client entries, interface definitions, and server entry live under `easel/modules/ui`, `easel/modules/table-style`, and `easel/applications/demo`. Game packages are resolved into a resource snapshot at startup; editing those package files requires restarting the game, but does not require recompiling Go.

## Develop

The lobby offers five applications: Pathfinder 1e, Easel Tabletop, Chess, Checkers and the demo table. Pathfinder 1e adds a rules engine, character sheets and expandable libraries of monsters, items and spells on top of the tabletop; see [Pathfinder 1e](design/pf1e.md). Easel Tabletop is a system-neutral virtual tabletop with battle maps, shadowbox stages, line-of-sight fog, chat, journals and combat tracking; see [kit UI](design/kit-ui.md). Chess and Checkers share a board table built from kit components, with persisted Go-interpreted Automations for gameplay; see [board games](design/board-games.md) for usage, rule limits and verification. Lobby management includes invitations, game roles, and installation administrators.

The frontend follows the old Easel screen structure, with My Games, an Applications library, game cards and search, create dialogs, tabbed settings, and an account menu.

```powershell
.\scripts\build.ps1
```

This builds the three editions into `bin/`: `easel-gm.exe` (one running game), `easel-group.exe`, and `easel.exe` (unrestricted). `.\scripts\build.ps1 -Distribution` also assembles a ready-to-copy folder per edition. `go build ./cmd/easel` builds the unrestricted edition alone.

- `cmd/easel`: configuration, startup, shutdown, the operator commands, and the edition build tags.
- `internal/hosting`: assembles one logical server (accounts, games, server application, routes) and reads `config/servers.json`.
- `internal/games`: game creation, start, stop, suspend, membership, the edition game limit, running-game ownership, schema migration plans, and package compatibility checks.
- `internal/files`: game file storage, with contents on disk and references in PostgreSQL.
- `internal/packages`: validated package installation, staging, rollback, and update channels.
- `internal/portable`: installation backup and restore, and game export, import, and account reassignment.
- `internal/seal`: protected packages and their licenses.
- `internal/platform`: the server definition and the catalog of installed packages.
- `internal/server`: HTTP route setup.
- `internal/database`: loads database settings from a file and opens a PostgreSQL connection pool.
- `internal/events`: single-threaded event engine with origin checks, payload validation, FIFO dispatch, and initialization events.
- `internal/automation`: automation language model, text parser, interpreter, and a file store for automations.
- `internal/automation/pgstore`: PostgreSQL stores for automations and records.
- `internal/security`: build-scoped registry of actions, permissions, groups, relationships, and declarative policy rules evaluated in Go.
- `internal/jsapi`: Sobek bindings for `Application.events`, `Application.automations`, and `Application.security`.
- `internal/session`: one goroutine and one Sobek runtime per session, serving serialized requests.
- `internal/manifest`: parses and validates `manifest.json` and resolves the security, library, and application load order.
- `internal/schema`: parses `data` declarations, composes record types across packages, and validates records in Go (see [data schema](design/data-schema.md)).
- `internal/ident`: the shared identifier validator.
- `design`: architecture and licensing decisions.

`scripts/test-security.ps1` starts a temporary PostgreSQL cluster, sets `EASEL_TEST_DATABASE_CONFIG`, and runs `go test ./...`. Without that variable the PostgreSQL integration tests are skipped. `-Run` selects tests, `-Package` a package, and `-Bench` runs benchmarks instead. `scripts/smoke.ps1` builds the three editions and exercises the real executables: clean install, sign-in, crash recovery, changing edition on the same data, backup, and restore.

## Accounts and sign-in

Accounts live in the `accounts` database schema, separate from game data, and belong to one logical server: an installation that hosts several servers keeps their accounts, administrators, and sessions apart. People sign up with a username and password, which are stored as Argon2id hashes, or sign in through an OAuth 2.0 provider. One account can have a password and any number of linked provider identities. A session is a random token in an HTTP-only, SameSite=Lax cookie; the database stores only its SHA-256 hash, and logging out deletes it. Failed logins are rate-limited per username and per address.

At startup, Easel checks the `hosting`, `accounts`, and `game_data` tables. A section whose tables are all absent is initialized from the canonical `easel/database/schema.sql` in a transaction, and existing tables and data are left untouched. A partially installed section, or a database whose recorded schema version differs from the one this build needs, stops startup with a diagnostic. During alpha the schema changes without migrations, so a database made by an older build is backed up, recreated, and initialized again. The database role needs schema-creation privileges. There are no incremental migration files during alpha.

| Route | Purpose |
|---|---|
| `POST /api/accounts` | Sign up with `username`, `password`, and an optional `displayName`. |
| `POST /api/sessions` | Log in with `username` and `password`. |
| `DELETE /api/sessions` | Log out. |
| `GET /api/me` | The signed-in user. |
| `GET /auth/{provider}/start` | Begin provider sign-in; add `?link=1` while signed in to link the provider to the current account. |
| `GET /auth/{provider}/callback` | Provider redirect target. |
| `POST /api/sessions/response` | Respond to a sign-in challenge with `challengeToken` and `response`. |
| `POST /files/{game}`, `PUT`/`GET /files/{game}/{file}` | Upload, replace, and fetch game files; see [server architecture](design/server.md#files). |
| `GET /api/fetch?url=` | Signed-in users fetch a public web address (deck lists, card and playmat images) through the server. Private network addresses are refused. |

POST bodies must be JSON, and requests from another origin are rejected. Providers are configured in `server/config/auth.json` (ignored by source control; copy `auth.example.json`). `google` and `discord` need only a client ID and secret; any other OAuth 2.0 provider can be added with `auth_url`, `token_url`, `userinfo_url`, `scopes`, `subject_field`, and `name_fields`. Register `{public_url}/auth/{provider}/callback` as the redirect URL with each provider. Without `auth.json`, Easel runs with password accounts only. Provider identities are never matched by email, so an outside account cannot take over an existing one.

## Local database (Windows)

PostgreSQL 18 is installed for the current Windows user at `%LOCALAPPDATA%\Easel\PostgreSQL18`. Its data directory is `data` beneath that location. It listens on `127.0.0.1:5432` and contains the `easel` database and an `easel` application role.

```powershell
.\scripts\database.ps1 start
.\scripts\database.ps1 status
.\scripts\database.ps1 shell
.\scripts\database.ps1 stop
```

Easel reads its connection settings from `server/config/database.json`, which is ignored by source control and already contains the local database credentials. For another installation, copy `database.example.json` to `database.json` and supply its connection details. `sslmode: disable` is for this local installation; configure TLS for a remote database. Override the settings path with `-database-config`.

`scripts/database.ps1 shell` uses the same `server/config/database.json` settings. The administrative password is stored in `admin-password.txt` beneath the local PostgreSQL installation. PostgreSQL does not start automatically at Windows login. The Easel launcher manages its startup and shutdown for local connections on port 5432; the commands above are available for manual administration. Easel opens a connection pool at startup, exits if it cannot connect within five seconds, and closes the pool during shutdown. Hosted games store their contract revisions, records, security principals, members, and invitations in `game_data` through `internal/automation/pgstore` and `internal/games`.

## Game sessions

`internal/session` provides one Sobek runtime and one owning goroutine per session. `NewGame` takes `Game.Packages`, each a `manifest.json` plus its files, and resolves one load order per stage with `internal/manifest`. It first runs every security entry as an ES module in its own Sobek runtime, where a `Security` object registers actions, permissions, groups, relationships, and policies; that runtime is then discarded. In the game runtime it runs every library entry. Interfaces are versioned: a manifest entry is written `"name@2"` or `{"name": "name", "versions": [2, 3]}`, and requirements name `"x.y@2"`. During the library stage a library calls `Easel.Interfaces.register(host, "x.y@n", class)` once per version for each interface it declares in `interfaces` (published as `host.name`) or lists in `implements`; `register` is removed when the stage ends. An interface entry with a `file` is registered from the manifest and loaded only when `create` chooses it or its `obj` is read from `list`; that file default-exports the class. `supports("x.y@n")` counts implementations of one version, `create("x.y@n")` instantiates the only implementation, otherwise the original from the declaring package, otherwise the first loaded, and `create("x.y@n", host)` picks one host. `list` alone accepts an unversioned name: `list("x.y")` returns every version and `list("x.y@n")` one version, as `{name, version, host, obj}` in priority order. It then runs every application entry, where `Application.security` offers only runtime checks and changes. Imports must be relative paths inside the importing package. A protected package runs only when it was installed sealed and this installation holds a license for it; see [Running Easel](design/operations.md#10-protected-packages). It then dispatches the loading events in order: `Load.Start`, `Load.Initialize`, `Load.Data.PreLoad`, `Load.Data.Ready`, `Load.Automation.PreLoad`, `Load.Automation.Ready`, `Load.Users.PreLoad`, `Load.Users.Ready`, `Load.Automation.Users.PreLoad`, `Load.Automation.Users.Ready`, and `Load.Finish`. Listeners register with `Server.events.on`. During the automation stage it saves each automation in `Game.Automations` that the repository does not already hold and binds the stored system automations; during the user automation stage it binds the stored user automations. Binding is not authorized; each run is. Record types become classes such as `easel.pathfinder.Character`; see [data schema](design/data-schema.md#records-in-code). `Game.GameID` and `Game.SessionID` scope every request for security. `Application.events.register`, `.on`, and `.emit` use the shared Go event engine. External Go adapters submit named events through distinct Server, Client, and Automation entry points. Calls are serialized within a session; different sessions have independent state. The application entry may export `handleMessage(message)` for server messages.

Automations are saved objects executed by Go, with compact text syntax and JavaScript object bindings through `Application.automations`. They support complex values, nested data, calls, conditions, loops, record saves and event emission. The `if` and `check` steps are available only in JSON definitions; the text syntax does not cover them. Games can configure build-scoped security policies, relationships, groups and runtime permission assignments through `Application.security`. PostgreSQL record operations require authorization and an effective-schema validator; saved PostgreSQL automation writes require transaction-bound authorization. See [security policy rules](design/security-update.md).

Custom game types require an effective-type validator; unknown types are rejected.

Creation and dispatch accept contexts to interrupt runaway JavaScript. `Close` interrupts active execution and waits for the session goroutine to stop. Cancellation does not roll back game state. Source must be trusted; this is not a resource sandbox, and no CPU or heap quotas are implemented.

The HTTP client uses the existing account session cookie. `/client/{type}` negotiates WebSocket protocol 1.0, supplies resolved client plans, and transports application events. `/assets/` serves only validated public client resources after authentication and game access checks. See [browser components](design/component.md) and [the runtime specification](design/EASEL_CLIENT_RUNTIME_DESIGN.md).

`server.NewClientGame` adapts an existing `session.ClientRuntime` and requires a game access callback. `Game.AuthorizeClient` authorizes each incoming application emission and each subscription/delivery, with immutable principal, game, session, and origin context. Missing authorization denies transport operations. Games are created, started, and joined by the server application through `Server.games` and `Server.connections` (see [server architecture](design/server.md)); `internal/games` runs each started game with PostgreSQL records and security, and gives every game its own folder under `server/games/` (`-games-dir`). Signed-in connections start in the server application, which serves the lobby; `connection.join` moves a connection into a game and the `leave` frame returns it. The default server application creates an open "Demo table" game on first start and starts the games that were running when Easel last stopped. Games can be suspended and resumed, keeping their timers. TV mode remains unimplemented.

Run `node --test scripts/test-client.mjs` for browser runtime unit tests. `scripts/test-security.ps1` exercises the Go and PostgreSQL suites, including authenticated WebSocket integration. For headless Edge acceptance, install Playwright in a development environment, set `EASEL_PLAYWRIGHT_MODULE` to its absolute `playwright/index.mjs` path, and run the same PowerShell script. Browser tests use an isolated temporary database and cover signup, login, event delivery, component movement, reconnect, logout, and mobile layout.
