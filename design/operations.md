# Running Easel

This guide is for the person who installs and operates Easel. It covers installation, configuration, hosting several servers, public hosting, the `easel` commands, backups, package updates, protected packages, editions, and recovery.

## 1. What an installation contains

```
easel.exe            the server; one executable per edition
easel/               installed packages, the browser files, and the database schema
config/              settings for this installation
games/               one folder per game, holding that game's files
```

| File in `config/` | Purpose | Required |
|---|---|---|
| `database.json` | PostgreSQL connection | Yes |
| `auth.json` | Public URL and outside sign-in providers | No |
| `servers.json` | The logical servers this installation hosts | No |
| `packages.json` | Update channel choices | No |
| `installation.key` | This installation's key for protected packages | Created on demand |
| `licenses/` | Licenses for protected packages | Created on demand |

Run Easel with the installation folder as the working directory. Each path can be overridden: `-database-config`, `-auth-config`, `-easel-dir`, `-games-dir`. Every command accepts the same path options, so a command always works on the installation the options name.

## 2. First start

1. Install PostgreSQL 15 or newer and create a database and a role that owns it. The role needs permission to create schemas.
2. Copy `config/database.example.json` to `config/database.json` and fill it in. Use `sslmode: disable` only for a database on the same machine.
3. Start Easel: `easel.exe` (the same as `easel.exe serve`).

On first start Easel creates its tables from `easel/database/schema.sql`. It refuses to start on a database made by an older build and says so: alpha builds have no migrations, so back up what you need, recreate the database, and start again.

Open the address Easel prints. The first person to connect becomes an administrator of that server.

## 3. Hosting several servers

One installation can host several logical servers. Servers share nothing: each has its own accounts, administrators, games, files, and server application data. An account on one server does not exist on another, and the same username can be registered on each.

Without `config/servers.json` Easel hosts one server named `default` on `-addr`. To host more, create the file:

```json
{
  "servers": [
    { "name": "club", "addr": "127.0.0.1:5000", "public_url": "https://club.example", "auth": "club-auth.json" },
    { "name": "shop", "addr": "127.0.0.1:5001", "public_url": "https://shop.example", "startup": "./easel/manifest.json" }
  ]
}
```

| Key | Meaning |
|---|---|
| `name` | The server's permanent name: 1 to 32 lowercase letters, digits, underscores, or dashes. Its data is found by this name, so renaming a server starts an empty one. |
| `addr` | The address this server listens on. Each server has its own. |
| `public_url` | The address people use to reach it. Defaults to `http://` plus `addr`. |
| `auth` | Sign-in settings for this server, relative to `config/`. Optional. |
| `startup` | The server definition to boot, relative to `easel/server/`. Defaults to the one named in `easel/server/server.json`. |

Every command takes `-server NAME` to choose which server it works on. The default is `default`.

Several installations may use one PostgreSQL database. A server, and each game, runs in one process at a time: a second process that tries to start the same server or game is refused. If the process that runs a game loses its database connection, it halts the game and keeps its state.

## 4. Public hosting

Easel speaks plain HTTP. Put it behind a reverse proxy that terminates TLS, and set each server's `public_url` to its `https://` address. With an `https://` public URL the session cookie is marked secure.

The proxy must:

- forward WebSocket upgrades on `/client/`;
- pass the browser's `Origin` header unchanged, because Easel rejects requests whose origin is not the public URL;
- allow request bodies as large as the file limit (32 MB by default) on `/files/`;
- keep idle connections open for at least two minutes.

A minimal Caddy configuration for the two servers above:

```
club.example { reverse_proxy 127.0.0.1:5000 }
shop.example { reverse_proxy 127.0.0.1:5001 }
```

For each outside sign-in provider, register `{public_url}/auth/{provider}/callback` as its redirect address. See `config/auth.example.json`.

Stop Easel with Ctrl+C. It stops accepting connections, records each running game's pending timers, and exits. Games that were running start again the next time Easel starts.

## 5. Games and their lifecycle

| State | Meaning | Starts with Easel |
|---|---|---|
| Running | The game has a runtime and accepts players. | — |
| `auto` | It was running when Easel last stopped. | Yes |
| `stopped` | Someone stopped it. Its pending timers were discarded. | No |
| `suspended` | Someone suspended it. Its pending timers are kept with the time they had left. | No |
| `relocated` | It was handed to another installation. | No, and it cannot be started until released |

Timers do not run while a game is suspended or while Easel is down after a clean shutdown. When the game starts again, each timer continues with the time it had left. After a crash, pending timers of running games are lost; saved records are not.

`easel games` lists a server's games with their state.

## 6. Commands

Every command prints JSON and exits with a non-zero status on failure.

| Command | Purpose |
|---|---|
| `easel serve` | Run the servers. This is the default. |
| `easel version` | The edition, its game limit, and the database schema version. |
| `easel games` | List a server's games. |
| `easel games release -game ID` | Allow a relocated game to start here again. |
| `easel backup -out FILE [-packages]` | Back up the installation. |
| `easel restore -in FILE` | Restore a backup into a clean installation. |
| `easel export -game ID -out FILE [-relocate]` | Write one game to an archive. |
| `easel import -in FILE [-name NAME] [-match-usernames] [-account OLD=NEW]` | Add an exported game to a server. |
| `easel accounts reassign -game ID -from ACCOUNT -to ACCOUNT` | Give one account's place in a game to another account. |
| `easel schema status -game ID` | A game's saved schema, its contributors, and whether its packages still fit it. |
| `easel schema migrate -game ID -plan FILE [-dry-run]` | Convert a game's saved data. |
| `easel files check` | List file records whose contents are missing. |
| `easel files sweep` | Also delete stored contents that no file record uses. |
| `easel packages …` | Install, update, and inspect packages (section 9). |
| `easel license …` | Licenses for protected packages (section 10). |
| `easel publisher …` | Publisher tools for protected packages (section 10). |

## 7. Backup and restore

`easel backup -out easel.zip` writes one archive with every server's accounts, games, saved schemas, records, automations, security data, game files, and the `config/` folder. It reads the database in one snapshot, so it can run while Easel is serving. Add `-packages` to include the installed applications, modules, and server definitions.

The archive holds password hashes, session tokens, the database password, and the installation key. Store it as you would store those.

`easel restore -in easel.zip` works only on a clean installation: a database with no accounts and no games. It creates the tables if they are missing, loads everything in one transaction, and writes the game files. It never overwrites a file that already exists in `config/` or `easel/`; it reports the ones it kept. Restore with the same Easel database schema version that made the backup.

To move an installation to another machine: back up with `-packages`, install Easel there, write `config/database.json` for the new database, and restore.

## 8. Moving one game

`easel export -game ID -out game.zip` writes one game: its records, saved schema and its history, automations, members and security data, files, and the package versions it was saved with.

`easel import -in game.zip` adds it to a server as a new, stopped game. The application must be installed. A module that is not installed keeps its saved data; its code does not run.

Accounts never move with a game, because accounts belong to a server. Each exported account's place in the game goes to:

1. the account named with `-account EXPORTED_ID=ACCOUNT_ID_OR_USERNAME`;
2. otherwise, with `-match-usernames`, the account with the same username on the target server;
3. otherwise a placeholder account, which cannot sign in.

Every reference to an account inside the game's data is rewritten to the account that took its place. Later, `easel accounts reassign` gives a placeholder's place to a real account and removes the placeholder. Stop the game before reassigning.

To hand a game over so that only one copy stays playable, export it with `-relocate`. Easel refuses if the game is running anywhere, writes the archive, and marks the game `relocated` so it cannot be started here by accident. If the move is abandoned, `easel games release -game ID` makes it startable again.

## 9. Packages

A package archive is a zip of a package folder with `manifest.json` at its root.

| Command | Purpose |
|---|---|
| `easel packages list` | Every installed package: version, requirements, supported clients, channel, kept versions, problems, and the games that use it. |
| `easel packages inspect -file FILE` | Validate an archive and describe it. Nothing is installed. |
| `easel packages install -file FILE` | Validate and install or update. |
| `easel packages remove -package ID` | Uninstall a module. |
| `easel packages rollback -package ID` | Return to the previously installed version. |
| `easel packages updates` | What each package's channel offers. |
| `easel packages update -package ID` or `-all` | Download and install newer releases. |
| `easel packages channel -package ID -channel NAME -update manual` | Choose a package's channel and when it updates. Use `default` as the package to set the default for all. |
| `easel packages pack -dir FOLDER -out FILE` | Make an archive from a package folder. |

Installing never leaves a half-installed package. Easel unpacks the archive into a staging folder and checks, before changing anything:

- every path stays inside the package, and the unpacked size is within limits;
- the manifest is valid and its files are present;
- every package it requires is installed;
- every application that uses it still loads and can still be delivered to each client it supports;
- **every saved game on every server still fits it.** An update that changes or removes a saved field is refused and names the games. Write a migration plan (section 11) or keep the installed version.

Only then does the new version replace the old one. The old one is kept under `easel/.previous/` for `rollback`. Removing a module keeps its saved data in every game that used it; reinstalling it brings the data back into use.

A package offers update channels in its manifest. Each installation chooses, per package, which channel to follow and whether to update `manual`ly or at `startup`. A startup update that fails any check is skipped and logged, and Easel starts with the version already installed.

A running server sees installed changes after `Server.packages.refresh()` or a restart. A running game keeps the packages it started with until it is restarted.

## 10. Protected packages

A publisher can distribute a package that only licensed installations can open.

**What it protects.** A protected package is one encrypted file plus a small manifest naming it. Its code and data are decrypted only in memory, only by an installation holding a license for it. The license is signed by the publisher, names who it was issued to, and opens only on the installation it was issued for. Copying the installed package, the archive, or the license to another installation does not work.

**What it does not protect.** Whatever a game sends to players' browsers reaches those players: client code, images, and any data the game shows. Someone who operates a licensed installation and is determined to extract a package from its memory can do so; no scheme that runs offline on the customer's machine prevents that. Easel does not contact a license server. The protection is that unlicensed copies do not run, and that every working copy is tied to a signed license naming its holder.

Publisher, once:

```
easel publisher init -name "Acme Games" -out acme.key
```

Keep `acme.key` secret and backed up. It can never be replaced: packages sealed with it open only with licenses made from it.

Publisher, for each release — the manifest must contain `"encrypt": {"public": "keys/publisher.pub"}`:

```
easel publisher seal -key acme.key -dir ./saga -out saga-1.0.0.zip
```

Customer:

```
easel license request
```

This prints the installation key. The customer sends it to the publisher.

Publisher:

```
easel publisher license -key acme.key -package acme.saga.game -major 1 -installation KEY -licensee "Riverside Gaming Club" -out riverside.license
```

Add `-expires 2027-12-31` for a license that ends.

Customer:

```
easel license install -file riverside.license
easel packages install -file saga-1.0.0.zip
```

A license covers one major version line of one package. Updates within that line need no new license; a new major version needs a new one. A protected package without a valid license is left out of the catalog, and `easel packages list` says why and repeats the installation key.

The installation key lives in `config/installation.key`. A backup includes it, so a restored installation keeps its licenses. An installation that loses the key needs new licenses.

## 11. Converting saved data

A game's saved schema is authoritative. A package update may add types and fields. Changing or removing a saved field, or cleaning up after a removed module, needs a migration plan.

`easel schema status -game ID` shows the saved schema, who contributed each part, how many records each type has, and `pending`: the reason the installed packages do not fit the saved data, if any.

A plan is a JSON file:

```json
{
  "fromRevision": "the revision shown by schema status; optional",
  "remove": { "contributors": ["acme.rpg.notes"], "declarations": ["acme.rpg.game/data[2]"] },
  "dropUndeclaredFields": true,
  "records": [
    { "type": "acme.rpg.Sheet", "rename": { "title": "name" }, "default": { "level": 1 }, "set": { "edition": 2 }, "unset": ["legacy.flag"] },
    { "type": "acme.rpg.Draft", "retype": "acme.rpg.Sheet" },
    { "type": "acme.rpg.Scrap", "delete": true }
  ]
}
```

The new schema is the saved one, with each declaration replaced by the installed package's version of it, minus what `remove` names. Each record rule applies to records of its type and of types that extend it; field paths use dots. `dropUndeclaredFields` removes fields the new schema no longer has; without it, a leftover field stops the migration.

`easel schema migrate -game ID -plan plan.json -dry-run` validates everything and changes nothing. Without `-dry-run` the conversion, the new schema, and every record check commit together or not at all. The game must be stopped. Back up first: a migration cannot be undone except by another migration or a restore.

## 12. Editions

| Edition | Executable built with | Running games at once |
|---|---|---|
| GM | `-tags gm` | One, across every server in the process |
| Group | `-tags group` | Unlimited |
| Unrestricted | no tags | Unlimited |

`scripts/build.ps1` builds all three into `bin/`; add `-Distribution` to assemble a folder per edition ready to copy to a machine. All editions use the same packages, database, files, and client protocol, so changing edition means replacing the executable and nothing else.

In the GM edition, starting a second game is refused with a message naming the running one. Stop or suspend it first; a suspended game keeps its timers and does not count.

## 13. When something goes wrong

| Symptom | Cause and remedy |
|---|---|
| "this database was created by an older Easel" | The database predates this build's schema. Back up, recreate the database, restore or start fresh. |
| "another Easel process is already running this server" | Two processes host the same server name on one database. Stop one, or give the second a different name. |
| A game does not start: "requires an explicit migration" | An installed package no longer fits the game's saved data. `easel schema status`, then roll the package back or migrate. |
| A game does not start: "this edition of Easel runs one game at a time" | GM edition limit. Stop or suspend the named game. |
| A package is missing from the lobby | `easel packages list` shows each package's problem, including a missing license. |
| Uploads fail with 413 behind a proxy | Raise the proxy's request body limit. |
| A file record's contents are missing | `easel files check` lists them. Restore the game's `games/<id>/files` folder from a backup. |

Easel logs every refused start, skipped update, and failed request with its reason to standard error.

## 14. Checking a build

| Script | What it proves |
|---|---|
| `scripts/test-security.ps1` | The Go suites against a temporary PostgreSQL, including server services, files, packages, lifecycle, multiple servers, backup and restore, export and import, migrations, and isolation under concurrent load. Set `EASEL_PLAYWRIGHT_MODULE` to add browser acceptance. |
| `scripts/smoke.ps1` | The three built executables: clean install, sign-in, recovery after a crash, changing edition on the same data, backup, and restore into a clean database. |
| `scripts/test-security.ps1 -Bench . -Package ./internal/games` | Platform benchmarks against PostgreSQL. |

Measured on one workstation (Intel Core Ultra 7 265K, local PostgreSQL 18), November 2026:

| Measurement | Result |
|---|---|
| One request that loads and saves a record, in one game | 1.5 ms |
| The same across eight games on two servers in parallel | 0.21 ms per request, about 4,800 requests per second |
| The same with delivery to 50 subscribers | 1.6 ms |
| Suspend and resume one game | 4.4 ms |

These numbers are for sizing, not a guarantee. Each game handles one request at a time; games run in parallel.
