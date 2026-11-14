# Kit tool libraries

The server library directory contains 28 Kit catalogs. Beyond 189 v1 members (85 server interfaces and 104 browser components) there is a second generation of 18 browser components and two server interfaces built on a shared UI layer; see `kit-ui.md`. The installed paths are `server/easel/server/library/<host>/`; `server/easel/server/server.json` makes their catalogs available to the server and hosted games. Public members use `easel.<host>.<member>@1` independently of their containing package's release version and package name.

[The library index](../server/easel/server/library/README.md) links each category's inventory, individual contracts and implementation files. Members are marked `tested`, or `used` when a shipped application composes them. The catalogs contain working tools rather than planned names or placeholder implementations.

## Loading and composition

New Kit manifests have no general library initialization, application entry, security entry or record declarations. Server members are default-exported classes loaded through `Easel.Interfaces.create`. Browser members have separate JSON contracts and per-interface `http-entry` files; use an exact interface requirement or await `Easel.Interfaces.load` before constructing a component. Importing the catalogs executes none of those member files. Repeated access reuses a class, while separate instances and games retain their own state and runtime.

Shared validation and DOM helpers are internal implementation details. Canonical sources are in the library root's `game/` and `client/` directories. `scripts/sync-kit-support.mjs` copies them into each participating package so runtime imports stay package-local. Selecting a member does not import the other member classes in that Kit.

Server tools operate on caller-supplied values. An update or transfer returns a proposed replacement rather than saving a record. The consuming application validates who may act and saves all parts of an operation in its existing transaction. This deliberately avoids imposing one record per card, one table-wide record, or a second membership model. A module composes these tools into a coordinated feature; a Kit does not run one.

Browser tools receive projected presentation data and emit declared local intents. They do not call application transport, read records, save changes, or establish permissions. A display component's existence does not imply a generic server mutation endpoint. Server and browser implementations are independent, including where they share a public name.

## Core services

The native server service `Easel.Random` uses Go's cryptographic random source. `integer(min,max)` accepts safe integer bounds, includes min and excludes max, and rejects empty or unrepresentable ranges. `fraction()` returns a value in [0,1). The service is frozen and scoped to the runtime. Shuffle, dice and weighted-table tools use it by default; an explicitly supplied trusted source is useful for deterministic tests.

Visual timers only update their displayed time. Server scheduling remains `Server.events.after/cancel`. Kits install no broad automation policies or autorun automations. The existing `easel.board` package and its automations remain unchanged; generic table tools use `easel.surfaces`.

## Verification

- `node --test scripts/test-kits.mjs scripts/test-client.mjs` checks each server member's contract/failure examples, input preservation, random-source use, coordinate round trips, manifests and component runtime behavior.
- `go test ./internal/session -run Kit` runs the same member examples through actual Sobek interfaces, proves no server member file loads on catalog import, checks independent member loading/caching and game isolation, and tests the native random service.
- `node scripts/test-kit-browser.mjs` renders every catalogued browser component (141 with the kit UI generation) in Edge, validates their emitted events and teardown, checks lazy browser imports, face-down presentation, camera focus and pointer-anchored zoom, shortcut focus handling and cleanup, and phone-width hand layout.
- `scripts/test-security.ps1` runs PostgreSQL, game, security and browser acceptance tests with an isolated database when Playwright is configured.

## Partition experiment

`scripts/benchmark-kits.mjs` compares cloning a full aggregate against preparing a 100-reference partition patch, at 1,200 and 5,000 cards. Six concurrent actors also make 120 optimistic, revision-checked transfers; all references remain present exactly once. [Recorded results](kit-library-benchmark.json) include timings, payload sizes and retry counts.

On this run, aggregate payloads were about 213 KB and 905 KB, while a touched-partition patch was about 1 KB. This is an in-process value-copying and membership experiment, not a PostgreSQL or network throughput measurement. Applications should select and measure their own persistence partitioning and transaction boundaries.
