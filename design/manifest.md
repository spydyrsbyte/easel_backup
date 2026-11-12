# Package Manifest

Every application, module, and kit is a package with a `manifest.json` at its root. The manifest says what the package is, and points to what it runs on the server and what it gives to clients.

> Status: implemented. Resolved client metadata is delivered over `/client/{type}` WebSockets. The browser signs in at `/` and fetches allowed resources over authenticated HTTP.

## 1. Files

```
manifest.json      identity, updates, encryption, and the two sides
server.json        what runs on the Easel server
client.json        what clients receive
```

`client` and `server` in `manifest.json` each take either form:

```json
"server": "./server.json"
```

```json
"server": { "library": { "entry": "./library/index.mjs" } }
```

A string is a path to a file in the package. An object is the same content written inline. A package can use a file for one side and inline for the other. A single compiled manifest is simply both sides written inline.

## 2. `manifest.json`

| Key | Meaning |
|---|---|
| `type` | `application`, `module`, or `kit` |
| `owner` | Required stable owner identifier, such as `easel`. |
| `host` | Required stable namespace within the owner, such as `cards`. |
| `name` | One package member identifier. The package ID is `owner.host.name`. |
| `authors` | Author names and contact details |
| `version` | `{major, minor, revision}` |
| `encrypt` | Optional DRM. `false` or absent means plain. An object such as `{"public": "./keys/key.txt"}` means encrypted. Encrypted packages are rejected until DRM is designed. |
| `channels` | Update sources: any channel name maps to `{manifest, file}`. The person running the game picks the channel and whether updates happen automatically on startup or manually. |
| `server` | The server side: a path or an inline object |
| `client` | The client side: a path or an inline object |

Identity uses exactly three segments: `owner.host.member`. Each segment is a JavaScript identifier; reserved words and prototype-related names are rejected. Bundled packages use owner `easel`.

The manifest keeps `owner`, `host`, `name`, and `version` separate. Interface and record identities use only the stable `owner.host` namespace and their declared member name. A release version or package display-name change must not be encoded into either namespace field. Changing a package's `name` changes its package ID, but not the identities of its interfaces or records. Interface contract versions such as `@1` are independent of package release versions.

For example, owner `easel`, host `cards`, and package name `table` give package `easel.cards.table`, interface `easel.cards.surface@1`, and record constructor `easel.cards.Deck`. Dependencies and implemented interfaces use all three segments; local declarations retain a single member name.

The resolved browser delivery plan's `host` field carries the full `owner.host` identity used by interface registration and implementation selection.

This replaces the alpha build's two-part identities. Old manifests require an owner and qualified references must be updated. Existing saved games using the old package/type names are not automatically converted or deleted; they require a separate data conversion before they can run with these packages. No database schema migration is introduced.

## 3. Server side

| Key | Meaning |
|---|---|
| `security` | `{entry, required}`. The security file runs once at startup in its own runtime. |
| `library` | `{entry, required}`. Runs during the library stage, and registers server interfaces. |
| `application` | `{entry, required}`. Runs after every library. |
| `interfaces` | Server interfaces this package declares |
| `implements` | Server interfaces this package implements |
| `data` | Record type declarations (see [data schema](data-schema.md)) |

`entry` is a `.mjs` file that Easel runs in Sobek. `security` and `data` exist only on the server side. A client never receives them.

## 4. Client side

| Key | Meaning |
|---|---|
| `library` | `{<client>-entry, required}` |
| `application` | `{<client>-entry, required}` |
| `interfaces` | Client interfaces this package declares |
| `implements` | Client interfaces this package implements |
| `assets` | Optional map from client type to public package-relative directories, such as `{"http":["./client/http/"]}` |

### 4.1 Client entries

A client entry is named after the kind of client it's for: `http-entry` for the browser client, `android-entry` for an Android client, and so on. A section can list several, and each client uses the one with its own name. Any `<client>-entry` key is accepted, so adding a new kind of client never changes the manifest format.

Easel never runs client entries. It hands each client the entry with that client's name, written in whatever language that client uses.

### 4.2 Client interfaces

Every client interface entry needs a `file`, and the file is JSON. It is the component definition that every client shares, while each client's entry provides that client's implementation. Easel reads and validates these files at startup, so a missing or malformed definition stops the game from starting.

An entry can also name its own implementation per client, such as `{"name": "hand@1", "file": "interfaces/hand.json", "http-entry": "client/hand.mjs"}`. That client then loads the implementation only when it is required or explicitly loaded, instead of from the package library. See [components](component.md#one-file-per-component). Server interface entries cannot use `<client>-entry`; their `file` is already loaded on first use.

### 4.3 Supported clients

A game supports a kind of client when every package it loads that has client code provides that client's entry. Easel works this out from the manifests. A client the game can't serve is told so when it connects, not partway through loading.

### 4.4 Public assets and browser startup

Declared client entry files and JSON interface files are individually downloadable. Their sibling files remain private unless included in an `assets` directory. Relative imports retain their package-root-relative hierarchy. Place static dependencies inside a public directory or bundle them into an entry.

Asset directories must exist inside the package, use forward slashes, and contain no symlinks. Startup rejects public paths exposing the manifest, a referenced server section, server entries, server interface files, or referenced server data schemas. Requests match a validated resource snapshot; arbitrary filesystem paths are never served. Assets require a valid account session and game access, use private caching with ETags, and supply correct MIME types.

The `welcome` plan lists packages plus independent `libraryOrder` and `applicationOrder` arrays of package IDs. All libraries execute before applications. Entries may export an asynchronous `initialize({Easel, Application})` function, which the loader awaits after import. Failed downloads or initialization prevent readiness. Protocol 1.0 negotiation is independent of package and interface versions. Resource URLs are supplied by the server and are not part of the protocol version contract.

Easel's pre-authentication shell is a client-only kit under `server/easel/modules/shell`. Its manifest-declared contracts and library use the same client delivery format, registration rules, and component manager as game packages. `/runtime/shell.json` supplies its plan, and `/runtime/shell/` exposes only its validated client allowlist before sign-in. This public bootstrap does not grant access to protected game assets.

## 5. Stages and requirements

Each `library`, `security`, and `application` section can have `required`:

```json
"required": {
  "modules": ["host.name"],
  "interfaces": ["host.name@2"]
}
```

- `modules` are package IDs.
- `interfaces` always include a version.
- `security` cannot require interfaces.

Load order follows the requirements: a stage's required packages load before it, and a library that requires an interface version loads after every package that declares or implements that version. Each stage is ordered independently, starting with the application's requirements, then the remaining packages in the order given.

## 6. Package types

The three types are three tiers. A kit is a library of tools, a module composes tools into a coordinated feature, and an application is the game.

| Type | Rules |
|---|---|
| `application` | Exactly one per game. Must have a server application entry. Owns the game's rules, wiring and persistence. |
| `module` | Has at least one entry or interface. May declare records, security, libraries and automations. |
| `kit` | Interfaces only, at least one. No library, application or security entry, and no records. Every server interface names a `file`, and every client interface its `<client>-entry`. |

A package of any type may omit its server `library` when every server interface names a `file`.

## 7. Interfaces

`interfaces` and `implements` take the same entry forms on both sides:

| Form | Meaning |
|---|---|
| `"name@n"` | Version `n`, implemented in the library entry (server only) |
| `{"name": "name@n", "file": ...}` | Version `n`, in that file |
| `{"name": "name", "versions": [...]}` | Those versions, in the library entry (server only) |
| `{"name": "name", "versions": [...], "file": ...}` | Those versions, in that file |

In `interfaces`, names are unqualified and published under the package's host. In `implements`, names are fully qualified. On the client side only the `file` forms are valid, and the file is JSON. Client entries may add `<client>-entry` keys naming a per-interface implementation file. See [interfaces](interfaces.md).

Any object entry may add `required`, with the same `modules` and `interfaces` form as a stage. A member's requirements are part of package composition, are checked when the game resolves, and on the client are loaded before the member is imported:

```json
{"name": "table@1", "file": "interfaces/table.json", "http-entry": "client/table.mjs",
 "required": {"modules": ["easel.graphics.pixi"], "interfaces": ["easel.graphics.pixi@1"]}}
```

## 8. Paths

Every path is relative to the package root, uses forward slashes, and must stay inside the package.

## Interface-only Kit libraries

The Kit catalogs under `server/easel/server/library/` use per-member implementation files and have no server/client library entry, application entry, security entry, or data declaration. The runtime registers those files as lazy candidates without executing them. Browser members use their JSON `file` plus the existing per-interface `http-entry`. Importing catalogs loads contracts, not implementations. See [Kit libraries](kit-libraries.md).
