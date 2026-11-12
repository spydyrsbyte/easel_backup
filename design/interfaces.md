# Easel Interface Architecture

## 1. Purpose

An interface is a named, versioned contract that packages implement and other packages use. It lets one package depend on a capability rather than on the package that provides it. A dice roller, a map renderer, or a rules engine can be swapped for another implementation without changing the code that uses it.

The pieces:

- A package **declares** an interface it owns.
- A package **implements** an interface, its own or another package's.
- A package **requires** an interface it uses.
- Game code **creates** an instance of an implementation through `Easel.Interfaces`.

Interfaces exist on two sides, listed separately in a package's [manifest](manifest.md):

- **Server interfaces** are JavaScript classes that run on the Easel server in Sobek. They are listed in the server side of the manifest and used through `Easel.Interfaces` (sections 5 to 8).
- **Client interfaces** are component definitions written in JSON. They are listed in the client side of the manifest and exported to clients. Each kind of client provides its own implementation through its `<client>-entry` (section 9).

> Status: implemented on the server and browser. Client interface JSON is delivered through the resolved WebSocket bootstrap plan and authenticated HTTP resources.

## 2. Naming and versions

An interface is identified by `owner.host.member@version`, for example `easel.pathfinder.dice@2`.

- `owner` and `host` are the declaring package's stable namespace identifiers.
- `member` is the declared interface name, a single JavaScript identifier.
- Package names and release versions do not participate in interface identity.
- `version` is a whole number of 1 or more. A change that breaks callers gets a new version. Versions are never ranges, and old and new versions can be implemented side by side.

## 3. Declaring in the manifest

`interfaces` and `implements` appear in each side of the manifest: `server.json` for server interfaces and `client.json` for client interfaces, or the same content inline. The examples below are server-side.

### 3.1 `interfaces`: interfaces this package owns

Names here are unqualified. They're published under the package's own host.

```json
"interfaces": [
  "dice@1",
  {"name": "dice", "versions": [2, 3]},
  {"name": "cards@1", "file": "./library/cards.mjs"},
  {"name": "cards", "file": "./library/cards-v2.mjs", "versions": [2, 3]}
]
```

### 3.2 `implements`: interfaces this package provides an implementation for

Names here are fully qualified, and can belong to another host.

```json
"implements": [
  "easel.pathfinder.dice@2",
  {"name": "easel.pathfinder.cards", "file": "./library/fancy-cards.mjs", "versions": [2, 3]}
]
```

### 3.3 Entry forms

Each entry in either list takes one of four forms:

| Form | Meaning |
|---|---|
| `"name@n"` | Version `n`, implemented in the library entry |
| `{"name": "name@n", "file": ...}` | Version `n`, implemented in that file |
| `{"name": "name", "versions": [...]}` | Those versions, implemented in the library entry |
| `{"name": "name", "versions": [...], "file": ...}` | Those versions, implemented in that file |

Rules:

- Every entry carries a version.
- An entry can't use both `@` and `versions`.
- One package can't list the same version twice.
- A package can't list its own declared interface in `implements`.
- A module with server `interfaces` or `implements` must have a server `library` entry. An interface-only Kit may omit that entry when every server implementation has its own `file`. A `kit` must provide at least one interface.
- On the client side, only the forms with `file` are valid, and the file is JSON, not `.mjs`. The browser runs its `http-entry` library; the Go server never executes client entries.

### 3.4 Requirements

A stage names the interfaces it uses, always with a version:

```json
"library": {"entry": "./library/index.mjs", "required": {"interfaces": ["easel.pathfinder.dice@2"]}}
```

## 4. Resolution

When the game's packages are resolved:

1. Every declared `owner.host.member@n` must be declared by exactly one package.
2. Every implemented `owner.host.member@n` must be a version some package declares.
3. Every required `owner.host.member@n` must be declared.
4. A library that requires `owner.host.member@n` loads after every package that declares or implements that version. By the time it runs, every implementation of that version is registered.

These rules apply to server and client interfaces alike, each side resolved within its own list. Client definition files are also read and checked as valid JSON. Breaking any of these rules stops the game from starting, with an error naming the package and the interface.

## 5. Registration (server)

### 5.1 Implementations in the library entry

During the library stage, the library entry registers a class for each version it declares or implements:

```js
export class Dice {
  roll(sides) { return 1 + Math.floor(Math.random() * sides); }
}
Easel.Interfaces.register("easel.pathfinder", "easel.pathfinder.dice@1", Dice);
Easel.Interfaces.register("easel.pathfinder", "easel.pathfinder.dice@2", Dice);
```

`register(namespace, "owner.host.member@n", class)` is explicit:

- The interface must include its version. One call registers one version.
- `namespace` must equal the calling package's `owner.host`.
- The package must list that version in `interfaces` or `implements` as implemented in its library entry, not in a file.
- The value must be a class.
- A host can register one implementation per interface version.

`register` is removed when the library stage ends. After that, nothing can register.

### 5.2 Implementations in a file (lazy)

An entry with a `file` is registered from the manifest itself. The file isn't loaded during startup; it loads the first time it's needed:

- when `create` picks it, or
- when code reads `obj` from one of its `list` entries.

The file's default export is the class. It doesn't call `register`. One file serves every version its entry lists, and once loaded, the class is cached. A broken lazy file only errors when it's actually used.

```js
export default class FancyCards { draw() { ... } }
```

## 6. Using interfaces (server)

All calls except `list` require a version.

| Call | Returns |
|---|---|
| `Easel.Interfaces.supports("owner.host.member@n")` | The number of implementations of that version, 0 or more |
| `Easel.Interfaces.create("owner.host.member@n")` | A new instance of the chosen implementation (section 7) |
| `Easel.Interfaces.create("owner.host.member@n", "owner.host")` | A new instance of that host's implementation |
| `Easel.Interfaces.list("owner.host.member@n")` | That version's implementations, in priority order |
| `Easel.Interfaces.list("owner.host.member")` | Every version's implementations, lowest version first, each version in priority order |

`list` entries are `{name, version, host, obj}`, where `obj` is the class. Reading `obj` loads a lazy implementation.

```js
const dice = Easel.Interfaces.create("easel.pathfinder.dice@2");
dice.roll(20);

const hosts = Easel.Interfaces.list("easel.pathfinder.dice").map(entry => entry.host + "@" + entry.version);
```

`create` throws if there's no implementation, if a named host has none, or if the version is missing. It calls the constructor with no arguments.

## 7. Selection

For a given interface version, `create` picks:

1. the only implementation, if there's exactly one; otherwise
2. the original, registered by the package that declared the interface; otherwise
3. the first one loaded. Load order is priority.

`list` uses the same order: the original first, then the rest in load order.

## 8. Lifecycle

| Stage | Interface activity |
|---|---|
| Resolution | Declarations, implementations, and requirements are checked. Library load order is set. |
| Library stage | Each library entry runs and may `register`. Lazy file entries are recorded. |
| End of library stage | `register` is removed. |
| Application stage and after | `supports`, `create`, and `list` are available. Lazy files load on first use. |

## 9. Client interfaces

A client interface splits the definition from the code:

- **The definition** is the JSON `file` in the client side of the manifest. It is the same for every kind of client. Easel reads it, checks it at startup, and exports it to clients.
- **The implementation** belongs to each kind of client, through that client's `<client>-entry` (`http-entry` for the browser, `android-entry` for Android, and so on), in whatever language that client uses. Easel never runs it.

```json
"interfaces": [
  {"name": "sheet@1", "file": "./interfaces/sheet.json"}
],
"implements": [
  {"name": "easel.pathfinder.portrait", "file": "./interfaces/portrait.json", "versions": [1, 2]}
]
```

Because definitions are shared, a new kind of client needs only its own entries. A game supports a kind of client when every package it loads that has client code provides that client's entry. Packages that keep most client code in kits gain support for a new client when those kits do.

How a client creates and uses its components is defined by the client (see [components](component.md)).

The browser exposes `Easel.Interfaces.supports`, `create`, and `list` with the server's exact-version and selection rules. `supports` returns the implementation count. `list` returns `{name, version, host, obj}` records with the registered browser class as `obj`.

During a package's browser library entry, `register(implementerHost, "owner.host.member@version", Class)` accepts only classes for interfaces that package declares or implements. The host must match the currently executing package. Duplicate registrations and registrations after the library stage fail. Every promised implementation belonging to a loaded library must register before applications run. Components marked `kind: "component"` additionally receive contract validation and lifecycle management.

Client JSON files remain definitions. An interface entry can add a `<client>-entry` naming that client's implementation file, which default-exports the class. The browser registers it without downloading it, imports it before any stage that lists the interface in `required.interfaces`, and otherwise on `await Easel.Interfaces.load("owner.host.member@n", host?)`. `create` and reading `obj` from `list` throw until it has loaded. A library cannot also register an interface that has a file for the same client. See [components](component.md#one-file-per-component).

## 10. Boundaries

- Packages reach each other only through interfaces. Imports must be relative paths inside the importing package.
- Server interfaces are plain JavaScript classes. Easel doesn't check that an implementation actually has the contract's methods. The contract is the version number and its documentation.
- Interfaces are separate from record types. A record type is data declared in `data`; an interface is behavior registered by a library.
