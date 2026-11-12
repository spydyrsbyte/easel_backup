# Easel Client Runtime, Components, and WebSocket Protocol

**Implementation specification — protocol 1.0**

## 1. Objective

Implement the missing client side of Easel's existing package architecture. The first client is the HTML/browser client. The architecture must also accommodate `/client/android` and other client types without changing package identity, interface resolution, application events, or the server's security model.

The server tells a client **what resources and entry points it needs**. The client obtains and executes those resources using its own platform-appropriate mechanisms. Once initialized, the client sends application events to the server and receives application events from the server through its WebSocket connection.

Every publicly managed UI element is an Easel component. In the browser, component implementations use ordinary HTML, CSS, JavaScript, SVG, Canvas, or WebGL. Their internal DOM nodes do not individually need Easel identities unless other components must independently address them.

### Existing features: reuse, do not replace

- Go backend; server-side JavaScript executes in **Sobek**, not Goja.
- Package manifests with `manifest.json` and inline or referenced server/client sections.
- Package types: `application`, `module`, and `kit`.
- Exact-version interface identifiers `host.name@version`.
- Server and client `interfaces`, `implements`, and stage-specific `required` dependencies.
- Existing startup validation and client support resolution.
- Existing server interface registration, selection, and lifecycle.
- Existing `Application.events.register`, `.on`, and `.emit` behavior, including declared event payloads, allowed origins, and server authorization.
- Existing authentication, identity, permission checks, and authoritative application state.

Do not build a second server package resolver, security subsystem, server interface registry, or application event engine. Add client-facing adapters where required.

## 2. Boundaries

**Implement now:**

1. Browser entry at `/`: an empty mount point and the loader. The sign-in shell is built from Easel's own components on top of the existing accounts API.
2. Generic WebSocket client bootstrap at `/client/{type}`, beginning with `http`.
3. Protocol `major`/`minor` negotiation.
4. Server instructions describing the resolved client resources, package load order, interface definitions, and entry points.
5. Safe HTTP delivery of browser resources, independent of the WebSocket.
6. Browser-side interface registry that uses resolved client manifests.
7. Browser component manager and minimum component contract.
8. Bidirectional forwarding of application events over the WebSocket.
9. Error handling, reconnection behavior, and automated tests.

**Do not implement as part of this task:** an Android renderer, a 2D/3D engine, a new game data model, a new permission model, a client-side copy of Sobek, or a general-purpose reliable/offline message queue.

## 3. Routing

| Route | Purpose |
|---|---|
| `/` | Browser entry: an empty mount point and the small loader, with no visible UI of its own. Every visible element, including sign-in, is a component. It is reserved for the HTTP client. |
| `/client/http` | Browser WebSocket endpoint. |
| `/client/android` | Android WebSocket endpoint when Android support is implemented. |
| `/client/{type}` | Generic dispatch mechanism for future client types. |
| `/assets/{packageKey}/{relativePath}` | Example resource-delivery route for client-visible package files; use an existing suitable static/resource route if one already exists. |

`/client/{type}` is a **WebSocket endpoint**, not a page or a download location. A non-upgrade HTTP request to it must not be treated as a successful bootstrap request.

The browser needs `/` because JavaScript must be loaded before it can establish a WebSocket. Other client types can be configured with their WebSocket address directly.

All client types use one transport/handshake/event protocol implementation. Their route determines client type; their resource loader and implementation language can differ. Do not fork the application protocol by client type.

### Resource delivery rule

The socket provides **instructions**, not application bundles or asset streams. Resource descriptors give the location, identity, version, and available integrity metadata for the resources required by that client. The client chooses how to fetch, cache, and load them.

For the browser, HTTP(S) is the resource transport. Preserve a package-relative URL hierarchy so that relative JavaScript imports and references to other files work correctly. The resource handler must never expose arbitrary package files or server-only assets.

Use the following **client-side manifest extension** if the existing asset system has no equivalent client-public allowlist:

```json
"assets": {
  "http": ["./client/http/"],
  "android": ["./client/android/"]
}
```

`assets` is optional on the **client side** of the existing manifest, and is a map from client type to a list of package-root-relative public directories. It is not a new manifest file. An entry under `assets.http` makes the directory and its descendants downloadable **only as client resources** for `http`. The explicit client entry files and JSON interface files from the resolved manifest must also be available to the appropriate client, even when they are outside an asset directory; their undeclared sibling files are not thereby exposed. Static dependencies of those entries must live in an allowed client asset directory or be bundled into a declared entry file.

Asset-serving implementation requirements:

1. Validate declared public directories at package resolution: relative paths only, forward slashes, no traversal/symlink escape, no overlap with any declared `server` security/library/application entry or server-only data resource.
2. Resolve each incoming URL against the package's validated client-visible allowlist. Never accept an arbitrary filesystem path supplied by the browser.
3. Preserve paths relative to the package root in URLs so module-relative `import` paths remain valid.
4. Serve correct MIME types (including `.mjs`, `.js`, `.css`, `.json`, images, and fonts), plus ordinary HTTP cache validators.
5. Enforce the existing game/session access rules for protected package resources; never leak one game's private package contents to another game.
6. Reject a package at startup when its declared client assets attempt to expose a known server-only path.

If the repository already has a client-visible asset manifest/allowlist, use it instead of adding a duplicate `assets` field, provided it meets these behaviors. All manifest paths remain package-root-relative and cannot escape the package root.

Do not make the resource URL format part of the versioned WebSocket protocol. Clients consume URLs supplied by the server.

## 4. Protocol versioning

The client transport protocol starts at:

```json
{"major": 1, "minor": 0}
```

These fields describe **the WebSocket application protocol**, not a package version, client interface version, or product build revision.

Rules:

1. `major` is incremented for breaking protocol changes.
2. `minor` is incremented for backward-compatible protocol additions.
3. Both values are nonnegative integers; initial `major` is 1.
4. A client and server can communicate when they support the same major. They use the lower supported minor for that major.
5. New minor-version behavior is additive. A peer cannot require a newer minor feature after negotiating an older minor.
6. An unsupported major receives a structured error, then the connection closes.
7. The negotiated protocol version is connection-scoped. Ordinary event messages do not repeat it.

Keep the negotiation independent of `manifest.version` (`major/minor/revision`) and interface `host.name@version`.

## 5. WebSocket message envelope

Use JSON text frames in protocol 1.0. Every frame is one JSON object with a `type` string. The following additional fields have consistent meaning:

| Field | Meaning |
|---|---|
| `type` | Message kind. |
| `id` | Sender-generated request identifier when a response is expected. |
| `replyTo` | Identifier of the request this message answers. |
| `name` | Application event name, for event frames. |
| `payload` | Application event data, for event frames. |

Identifiers are opaque strings. They are connection-local correlation identifiers, **not** authentication information or globally unique object IDs. Any frame containing an invalid envelope or unexpected fields of the wrong type fails validation with a protocol error; handle unknown *optional* fields compatibly within an accepted minor version.

Use one ordered WebSocket connection for bootstrap control and application events. There is no parallel event transport.

### Defined message types

| Direction | Type | Purpose |
|---|---|---|
| Client → server | `hello` | Advertise client protocol version. |
| Server → client | `welcome` | Confirm negotiated protocol and provide bootstrap plan. |
| Server → client | `error` | Respond to rejected handshake, operation, or malformed message. |
| Client → server | `ready` | State that required client modules and interfaces have initialized. |
| Server → client | `ready.ok` | Confirm the connection has entered application mode. |
| Client → server | `event` | Emit a registered application event to the server. |
| Server → client | `event` | Deliver a server-authorized application event to the client. |
| Server → client | `event.ack` | Acknowledge acceptance of a client event into the existing event engine. |
| Client → server | `subscribe` | Request delivery of named application events. |
| Client → server | `unsubscribe` | Stop requested delivery of named application events. |
| Server → client | `subscription.ack` | Confirm which requested subscriptions were accepted or rejected. |

Message IDs are required for `hello`, `ready`, client-originated `event`, `subscribe`, and `unsubscribe`; responses use `replyTo`. Server-originated event deliveries do not need a response unless a future protocol explicitly introduces one.

## 6. Connection and startup sequence

### Step A — browser entry

1. Browser requests `/`, which returns an empty mount point and a **small, stable** browser loader.
2. The loader builds the sign-in shell from Easel's own components: the header, sign-in and account creation, provider sign-in, connection status, retry, and sign-out. These components come from Easel-provided component packages that are available before sign-in. They use the existing accounts API. Do not create a second login system.
3. After authentication, the loader establishes a WebSocket to `/client/http`, using `wss:` for HTTPS and `ws:` only where HTTP is intentionally used.
4. The game's components are built through the same component runtime and mounted into the shell.

For a non-browser client, start at the appropriate `/client/{type}` endpoint; it has no dependency on `/`.

### Step B — identity and hello

Authenticate the socket using the existing system. For a browser, apply the existing session mechanism and validate the request's origin. The client route identifies its type; ignore any client attempt to claim a different type in a message. Authorization checks on later messages use the authenticated session, not IDs supplied in event payloads.

Client sends:

```json
{
  "type": "hello",
  "id": "h1",
  "protocol": { "major": 1, "minor": 0 }
}
```

The server checks the protocol and whether the loaded game supports `http` (from existing resolved manifests). If either check fails, it sends a precise error and closes the connection.

### Step C — server provides the plan

The server replies with a `welcome` containing the negotiated protocol and a client-specific startup plan derived from **already resolved** package/client definitions:

```json
{
  "type": "welcome",
  "replyTo": "h1",
  "protocol": { "major": 1, "minor": 0 },
  "client": "http",
  "packages": [
    {
      "id": "sample.ui",
      "version": { "major": 1, "minor": 0, "revision": 2 },
      "baseUrl": "/assets/sample-ui-1-0-2/",
      "interfaces": [
        {
          "name": "sample.button@1",
          "url": "/assets/sample-ui-1-0-2/interfaces/button.json"
        }
      ],
      "implements": ["sample.button@1"],
      "libraryEntry": "/assets/sample-ui-1-0-2/client/http/library.mjs",
      "applicationEntry": null
    }
  ]
}
```

An interface whose manifest entry names an implementation file for this client carries `"implementation": "<url>"` and is left out of `implements`, because the library does not register it. Packages also carry `libraryRequires` and `applicationRequires`, the stage's `required.interfaces`, whose implementation files are imported before that stage runs.

This is an example of the **resolved delivery plan**, not a replacement for `manifest.json`. The server must construct it from the actual resolved game packages. `packages` is ordered according to existing requirements. Clients must run *all applicable library entries before any application entries*; dependency ordering applies within each stage. Omit stage entries that do not exist; `null` is shown here only to make the example explicit.

The server provides the client-side interface JSON and implementation metadata, **never** the `server` section, security entry, server-only data declarations, or server `.mjs` files.

The plan may include optional resource hashes if supported by existing resource metadata; the client can use them to avoid unnecessary downloads. Do not require redownloading unchanged resources. Package `revision` remains a pushed/published build revision, not a count of local executions.

A missing or invalid required resource is a startup failure, with a package/path-specific error. Do not silently continue with an incomplete application.

### Step D — client loads resources

1. Resolve/download required client interface JSON definitions.
2. Install their definitions into the browser-side interface registry, and register any per-interface implementation files without downloading them.
3. Load the HTTP library entry for each applicable package in library-stage order, first importing implementation files for the stage's required interfaces.
4. Library entries register browser implementations of the interfaces they declared or implement.
5. End the browser library-registration stage; reject subsequent registrations.
6. Run application entries in application-stage order.
7. Initialize the root UI component and application-level event listeners.
8. Send `ready`.

Example:

```json
{ "type": "ready", "id": "r1" }
```

Server responds:

```json
{ "type": "ready.ok", "replyTo": "r1" }
```

After `ready.ok`, application events may be emitted and delivered. A client must not be marked ready merely because assets downloaded; required modules must have executed successfully.

### Step E — active application

Client and server exchange application event frames on this same WebSocket until disconnect. Bootstrap messages are not replayed during normal operation.

On reconnect, authenticate and handshake again, compare resource versions/hashes, reuse valid cached resources, and reestablish subscriptions. Do not pretend that reconnection itself guarantees replay of events missed while disconnected. Obtain current authoritative state through Easel's existing state/synchronization facilities; do not invent an event-replay service as part of this task.

## 7. Browser interface registry

Implement a **browser-local** `Easel.Interfaces` API, backed by client-side metadata delivered through `welcome`. It mirrors the useful semantics of the existing server registry without sharing its Sobek runtime or classes.

Expose:

```javascript
Easel.Interfaces.supports("host.name@1");
Easel.Interfaces.create("host.name@1");
Easel.Interfaces.create("host.name@1", "implementerHost");
Easel.Interfaces.list("host.name@1");
Easel.Interfaces.list("host.name");
```

During the browser library stage, also expose:

```javascript
Easel.Interfaces.register("implementerHost", "host.name@1", Class);
```

Registration rules:

- Only packages whose **client manifest** declares or implements the given exact interface version may register its implementation.
- The registering `implementerHost` must be the currently executing package's host.
- One implementation per host per exact interface version.
- The value must be a class; construction uses no arguments, matching existing server interface creation semantics.
- Registration ends with the library stage.
- Every non-lazy implementation promised by a loaded `http-entry` must be registered by the end of that stage, or startup fails with the package/interface named.
- Interface versions are exact positive integers; no ranges.

Selection semantics are the same as the existing server design:

1. Sole implementation, if only one exists.
2. Otherwise the implementation from the declaring host, if present.
3. Otherwise the first loaded implementation.
4. An explicit implementation host overrides default selection when available.

`list()` returns records containing `{name, version, host, obj}` in the existing priority order; for HTTP, `obj` is the registered browser class. Do not introduce a second component-specific implementation priority system.

The JSON interface definition is metadata describing the contract. The browser JavaScript class supplies the implementation. The Go server must not execute this implementation.

## 8. Minimum client component contract

Any client interface intended to represent a UI component uses a shared JSON contract describing its public API. Define and validate the following minimum structure, **without adding a separate component namespace or registry**:

```json
{
  "kind": "component",
  "properties": {
    "text": { "type": "String", "default": "" },
    "enabled": { "type": "Boolean", "default": true }
  },
  "events": {
    "pressed": { "payload": {} }
  },
  "slots": {}
}
```

The interface's full name and version come from its client manifest declaration, not from a duplicate identifier in the JSON file. The JSON file is shared across client types even though the present implementation targets HTML only. Unknown supported JSON contract kinds, if any already exist, must remain usable; `kind: "component"` identifies those managed by the component runtime.

### HTML implementation class

A browser implementation is a plain JavaScript class with:

| Member | Required | Semantics |
|---|---|---|
| `element` | Yes | Root DOM element owned by the component implementation. |
| `slots` | For containing components | Mapping of declared slot names to DOM container elements owned by this instance. |
| `update(props)` | Yes | Apply the complete current public property set. |
| `mount()` | No | Called after insertion into the DOM. |
| `unmount()` | No | Called before removal from the DOM. |
| `destroy()` | Yes | Clean up listeners, timers, observers, and other resources. |

The class constructor takes **no arguments**. The component manager creates an instance through the interface registry and then calls `update()` before the first mount.

Example browser entry:

```javascript
class Button {
  constructor() {
    this.element = document.createElement("button");
    this.slots = {};
    this.onPress = () => this.onEvent?.("pressed", {});
    this.element.addEventListener("click", this.onPress);
  }

  update(props) {
    this.element.textContent = props.text;
    this.element.disabled = !props.enabled;
  }

  destroy() {
    this.element.removeEventListener("click", this.onPress);
  }
}

Easel.Interfaces.register("sample", "sample.button@1", Button);
```

`onEvent` is installed and owned by the component manager after construction. The implementation calls it only with events defined by the interface contract. It must not assign its own application identity or bypass the component manager.

Native HTML event handling is fine inside an implementation; the manager only standardizes events explicitly exposed to other Easel components.

## 9. Browser component manager

Expose `Easel.Components` for instances. It uses `Easel.Interfaces` to select/construct the implementation, and it owns instance identity and parent/child relationships.

```javascript
const button = Easel.Components.create("sample.button@1", {
  id: "rollButton",
  props: { text: "Roll", enabled: true }
});

const panel = Easel.Components.get("mainPanel");
button.attach(panel, "content");
button.on("pressed", () => Application.events.emit("character.roll", { sides: 20 }));
```

Required manager API:

| API | Behavior |
|---|---|
| `create(interfaceName, {id?, host?, props?})` | Resolve implementation and construct a managed instance. `host` selects a specific implementer. |
| `get(id)` | Return public instance handle or `null`. |
| `setProps(patch)` | On a handle, validate and merge a patch, then call implementation `update(fullProps)`. |
| `attach(parent, slot)` | Insert or move an existing component into a declared slot. |
| `detach()` | Remove from its parent without destroying instance or children. |
| `destroy()` | Recursively dispose of the component and its children and invalidate its handle. |
| `on(eventName, listener)` | Subscribe to a declared UI event; return an unsubscribe function. |

Contract rules:

1. `id` is unique within the current client application instance. Autogenerate one if omitted.
2. The manager tracks `parent`, child ordering, and slot assignment; an HTML implementation does not own these public relationships.
3. Attaching a child moves the *existing* instance and DOM subtree. It does not copy, destroy, or reconstruct it.
4. A component can have at most one parent. Reject cycles.
5. Only declared slots accept managed children. Zero-slot components reject `attach` attempts.
6. `detach` retains component identity, properties, children, and subscriptions.
7. `destroy` releases descendants, event handlers, DOM nodes, and registry identity.
8. Public properties and events must conform to the JSON component definition. Apply declared defaults.
9. Implementation-private DOM can be freely managed by its owner, but other components interact through the public handle.
10. Any new public UI unit, including a map or entire sheet, can be an Easel component. Rendering technologies used internally are unrestricted.

Every visible element is a component, and that includes Easel's own UI. The sign-in shell is an Easel component tree mounted into the loader's DOM root, and the root application UI is a component mounted inside it. `/` contributes no visible markup of its own, and the loader contains no hand-built UI. Component implementations come from any package that provides them, whether Easel's own or a game's. Do not force components to inherit from a JavaScript base class; contract conformance is sufficient.

### Implementation replacement

Support creating a specific implementation through the `host` argument immediately. Runtime replacement of an *existing* mounted implementation may be added later; **do not silently rebuild and discard its private state in version 1**. A component's public interface allows future replacement without changing calling code.

## 10. Events: local UI vs application events

Maintain two clear scopes:

- **Component UI event:** e.g., `pressed`. Delivered locally to handlers on that component handle. A mouse click does not automatically become a server event.
- **Application event:** e.g., `character.roll`. Emitted through `Application.events.emit`, handled by the existing Easel event system, and transported over the WebSocket when emitted by a browser client.

This distinction prevents ordinary DOM mouse movement, resizing, and other internal UI details from flooding the server while giving game authors a direct way to send meaningful game actions.

### Client to server

Example:

```json
{
  "type": "event",
  "id": "e17",
  "name": "character.roll",
  "payload": { "sides": 20 }
}
```

Server processing:

1. Confirm connection is authenticated and `ready`.
2. Validate the frame and registered event name/payload through the **existing event definition**.
3. Treat its origin as **client** in the existing event-origin checks. The client must not choose `server` or `automation` origin by providing a field.
4. Use the authenticated connection's immutable identity, requestor, and application context. Ignore or reject spoofed identity fields.
5. Apply the existing permission and authorization rules, including explicit-deny precedence.
6. Dispatch into the existing server application event engine. Do **not** create a second set of handlers for WebSocket events.
7. Return an acknowledgment when accepted, or an error when rejected.

Successful acceptance example:

```json
{ "type": "event.ack", "replyTo": "e17" }
```

An acknowledgment means the existing engine **accepted the emission**, not that all possible asynchronous game effects have completed or that any requested action succeeded. Application outcomes are expressed through subsequent application events or existing application responses.

The browser's `Application.events.emit(name, payload)` should return a Promise resolved by `event.ack`, rejected by an error or disconnection. The server-side Sobek API retains its existing semantics; do not change it just to match the browser's asynchronous transport.

### Server to client

Example:

```json
{
  "type": "event",
  "name": "character.moved",
  "payload": {
    "character": "character-42",
    "from": { "x": 1, "y": 2 },
    "to": { "x": 2, "y": 2 }
  }
}
```

The server may deliver only events that the existing event routing and authorization rules allow that particular client/session to receive. A subscription is **a delivery preference**, not permission to access an event. Do not broadcast every server event to every socket.

Deliver events to the browser's `Application.events.on(name, handler)` listeners. Provide `off` or the unsubscribe function returned by `on`, as appropriate to the established API. Events received over the socket are not automatically sent back to the server.

### Subscriptions

When browser listeners require server-delivered events, send a subscription over the same socket:

```json
{ "type": "subscribe", "id": "s1", "names": ["character.moved"] }
```

Server reply:

```json
{
  "type": "subscription.ack",
  "replyTo": "s1",
  "accepted": ["character.moved"],
  "rejected": []
}
```

`unsubscribe` has the same request format and an acknowledgment describing accepted/rejected removals.

- Registering the first listener for a server-delivered event subscribes the socket to it.
- Removing the final listener unsubscribes it.
- Multiple local listeners for the same event use one server subscription.
- Server checks existing delivery permissions before approving a subscription and again when delivering.
- Reconnect must reissue active subscriptions.
- The client establishes required subscriptions before sending `ready` (or queues them during startup and flushes them before `ready`).

If the existing server event system already has a delivery-subscription mechanism, adapt to it rather than implementing a competing router.

## 11. Errors and lifecycle

Use structured errors:

```json
{
  "type": "error",
  "replyTo": "e17",
  "code": "event.denied",
  "message": "Not permitted to emit this event"
}
```

Minimum error codes:

| Code | Meaning |
|---|---|
| `protocol.unsupported` | No compatible protocol major version. |
| `protocol.invalid` | Invalid message or incorrect message for current phase. |
| `client.unsupported` | The resolved game does not support this client type. |
| `auth.required` | Authentication is absent or invalid. |
| `startup.resource_missing` | Required client resource could not be resolved or fetched. |
| `startup.interface_missing` | Required interface or implementation is unavailable. |
| `event.unknown` | Event is not registered. |
| `event.invalid` | Event payload fails schema validation. |
| `event.denied` | Origin or authorization rules reject the event. |

Do not send stack traces, server-only paths, secret configuration, or permission internals to clients. Log full diagnostic context on the server. A failed critical bootstrap step stops startup; don't mark an incomplete client ready.

Connection states:

```text
CONNECTED → NEGOTIATING → BOOTSTRAPPING → READY → DISCONNECTED
                       └──────── error ─────────→ CLOSED
```

- Allow only `hello` before negotiation.
- Allow `subscribe`/`unsubscribe` during bootstrap as needed to initialize listeners, and `ready` only after successful loading.
- Allow application `event` frames only in READY state.
- On disconnection, release connection-scoped subscriptions and reject outstanding browser Promises. Preserve user/game state using existing server mechanisms, not connection objects.
- Reconnect begins from negotiation again and restores subscriptions.

WebSocket ordering is sufficient for frame ordering on a live connection. Do not promise exactly-once processing across connection loss: an event may have been accepted even if the acknowledgment was not received. No automatic replay/retry of non-idempotent application events in protocol 1.0.

## 12. Server/client responsibilities

| Server (Go/Sobek) | Browser (HTML/JS) |
|---|---|
| Resolves and validates packages at startup. | Receives resolved package instructions. |
| Decides supported client types. | Connects to its specified client endpoint. |
| Authenticates and authorizes. | Uses existing login/session. |
| Supplies URLs and metadata for client-visible resources. | Fetches, caches, and loads resources through HTTP. |
| Owns authoritative state and event engine. | Owns DOM/component instances and presentation state. |
| Validates client-originated application events. | Emits game actions using `Application.events.emit`. |
| Routes permitted events to connected clients. | Handles them with `Application.events.on`. |
| Never executes client entries. | Never executes server/security entries. |

## 13. Implementation sequence for Codex

Follow this order and preserve working existing code.

1. **Inspect:** Find current manifest parser/resolver, resolved client support data, existing HTTP router, authentication/session handling, event registration/dispatch/authorization, and WebSocket facilities. Use existing types and abstractions rather than duplicating them.
2. **Protocol types:** Implement shared Go protocol structures/envelope parsing, version negotiation, and connection state machine. Tests first for major/minor compatibility and invalid message order.
3. **Route:** Add `/client/{type}` WebSocket routing. Reuse a single underlying handler; verify that `http` support is derived from resolved client manifests.
4. **Bootstrap plan:** Convert existing resolved client package data to the `welcome` plan. Do not parse raw manifests again per connection. Preserve stage dependency order and only include client-side entries/definitions.
5. **Resource access:** Serve client-visible assets using the current resource system or a safe, client-only resource route. Preserve relative paths and prevent server-only file exposure.
6. **Browser loader:** Serve `/` as an empty mount point and a small JS loader. The loader builds the sign-in shell from Easel's components, then negotiates, downloads and loads the game's packages, initializes them, and reports readiness.
7. **Browser interface registry:** Implement registration/selection with the existing interface rules. Verify registrations against the client manifest resolution results.
8. **Browser component manager:** Implement the minimum contract, slots, identity, containment, lifecycle, properties, and local UI events. Provide at least one basic component end-to-end.
9. **Event bridge:** Map browser `Application.events.emit` and `.on` to WebSocket event emission, subscriptions, receipts, and delivery. Dispatch server events through the existing server engine with authenticated origin/context.
10. **Integration tests:** Run a representative game with a kit, module, and application, including an alternate client implementation of an interface, then verify all cases below.
11. **Documentation:** Update `manifest.md`, `interfaces.md`, and `component.md` with the implemented browser API/protocol. Describe any additive client asset declarations exactly as implemented.

Do not create placeholder successful handlers or silently downgrade requirements. If the repository's established implementation differs from an example in this specification, integrate through existing APIs and preserve the stated behavior rather than replacing functioning subsystems.

## 14. Acceptance tests

A Codex implementation is complete when all of the following pass:

### Connection and bootstrap

- `/` serves only a mount point and the loader. The sign-in shell is built from components and uses the existing accounts API.
- Authenticated browser negotiates protocol 1.0 at `/client/http`.
- Unsupported protocol major returns `protocol.unsupported` and closes.
- A higher compatible minor negotiates down to the common minor.
- A game not supporting `http` rejects the browser before sending assets.
- `/client/android` uses the same handler/protocol and reports unsupported when the loaded game cannot support it; there is no need to implement the Android client now.
- All required library entries initialize before application entries, with dependency order preserved.
- Missing client interface/resource or failed initialization prevents READY.
- `welcome` never includes server-only paths, code, security definitions, or server data schemas.
- Client assets are retrievable over HTTP without sending their bytes through the socket; arbitrary server-side files are not retrievable from the asset route.

### Interfaces and components

- Two packages implementing the same client interface are listed and can be explicitly selected by host.
- Default selection agrees with existing interface selection rules.
- Unauthorized/undeclared client interface registration fails.
- Registration after the library stage fails.
- A component can be constructed, updated, attached, moved, detached, and destroyed.
- Moving preserves the same public identity and implementation instance.
- An undeclared slot, a parent cycle, or duplicate ID is rejected.
- Destroying a parent destroys all descendants and unregisters their IDs/listeners.
- A component's local `pressed` event can cause a registered application event to be emitted without DOM internals being visible to the parent.

### Events

- An authorized browser event reaches the **existing** server `Application.events` handlers over WebSocket.
- A client cannot spoof server/automation origin or another session's identity.
- An event disallowed by its origin mask or explicit-deny permission is rejected.
- Malformed/unregistered events are rejected with correlated errors.
- A server event reaches only subscribed, authorized browser sessions.
- Events received by the browser do not loop back into the server.
- Multiple local listeners result in one server subscription for the event.
- Disconnect removes server subscriptions and rejects outstanding event Promises.
- Reconnect performs handshake and reestablishes subscriptions without claiming guaranteed replay or exactly-once delivery.

## 15. Decisions fixed by this specification

- HTML/browser first; components remain modular and implementations replaceable.
- Go server with Sobek, unchanged as the authoritative runtime.
- `/` belongs to browser startup, where the sign-in shell is built from components; `/client/{type}` belongs to client WebSockets.
- One common WebSocket protocol, versioned `major,minor` independently from packages.
- WebSocket carries instructions and application events, not bulk resource downloads.
- Client interfaces remain the existing manifest-declared, JSON-defined contracts.
- The browser gets a runtime interface registry that follows existing selection rules.
- Every externally addressable UI unit is managed through `Easel.Components`.
- Local UI interactions become server events only when application code emits them.
- All browser-to-server application events go through existing validation, security, and `Application.events` dispatch.
- Browser listeners receive server-delivered events through the same socket.
