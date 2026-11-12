# Browser components

The implemented component API is `Easel.Components`, backed by the same browser `Easel.Interfaces` registry used for other client interfaces. See [the runtime protocol](EASEL_CLIENT_RUNTIME_DESIGN.md) for the transport specification.

A client manifest declares an exact interface version and points to its JSON contract:

```json
{"kind":"component","properties":{"text":{"type":"String","default":""},"enabled":{"type":"Boolean","default":true}},"events":{"pressed":{"payload":{}}},"slots":{}}
```

The manifest supplies the interface identity. JSON does not repeat it. `properties`, `events`, and `slots` must be objects. Supported property and event field types are String, Boolean, Number, Integer, Object, Array, and Null, case insensitive. Properties use declared defaults; fields without defaults must be supplied. Unknown fields and invalid types fail validation. Event payload fields are required.

A browser implementation is a no-argument JavaScript class. It owns its root `element`, provides `update(fullProps)` and `destroy()`, and optionally provides `mount()` and `unmount()`. A containing component exposes `slots`, mapping each contract slot to a DOM element within its own root. The manager installs `onEvent(name, payload)` after construction. Implementations call this function for declared local UI events.

```javascript
export function initialize() {
  class Button {
    constructor() {
      this.element = document.createElement("button");
      this.click = () => this.onEvent?.("pressed", {});
      this.element.addEventListener("click", this.click);
    }
    update(props) {
      this.element.textContent = props.text;
      this.element.disabled = !props.enabled;
    }
    destroy() {
      this.element.removeEventListener("click", this.click);
    }
  }
  Easel.Interfaces.register("sample", "sample.button@1", Button);
}
```

The loader imports an entry and then awaits its optional exported `initialize({Easel, Application})` function. Top-level initialization also runs. Libraries finish before any application entry runs. Registration is allowed only while the declaring package's library entry is running.

### One file per component

A component can instead name its own implementation file, so its code downloads only when a game uses it:

```json
"interfaces": [
  {"name": "hand@1", "file": "interfaces/hand.json", "http-entry": "client/hand.mjs"}
]
```

The file default-exports the class and does not call `register`. It may export `initialize({Easel, Application})`, which runs once after import. The JSON contract still loads at startup; the code does not.

The file is imported:

- before a library or application stage that lists the interface in `required.interfaces`, so `create` works synchronously there; or
- when code calls `await Easel.Interfaces.load("owner.host.hand@1")`, optionally with a host.

A component that uses or creates other interfaces lists them in the entry's own `required`; they load before its file is imported.

`create` on an implementation that has not loaded throws an error naming `Easel.Interfaces.load`. A package can mix both forms: interfaces without an entry for the connecting client are still registered by its library.

```javascript
export function initialize() {
  const panel = Easel.Components.create("sample.panel@1", {
    id: "mainPanel",
    props: {text: "My game"}
  });
  const button = Easel.Components.create("sample.button@1", {
    id: "rollButton",
    host: "sample",
    props: {text: "Roll", enabled: true}
  });
  button.attach(panel, "content");
  button.on("pressed", () => {
    Application.events.emit("character.roll", {sides: 20}).catch(console.error);
  });
  Easel.Components.mountRoot(panel);
}
```

`create(interfaceName, {id?, host?, props?})` constructs an instance and applies its complete properties before mounting. IDs are unique; omitted IDs are generated. `host` selects an implementation explicitly using the interface registry's existing priority rules. `get(id)` returns a handle or null.

Handles expose `id`, `props`, `parent`, `children`, and `slot`, plus these methods:

| Method | Behavior |
|---|---|
| `setProps(patch)` | Validate and merge properties, then update the implementation. |
| `attach(parent, slot)` | Move this instance and its subtree into a declared slot. Reject cycles. |
| `detach()` | Remove from the visible tree, retaining identity, children, properties, and listeners. |
| `destroy()` | Recursively dispose descendants, listeners, DOM, and IDs. Invalidate handles. |
| `on(name, listener)` | Subscribe to a declared local UI event; return an unsubscribe function. |

The entry page contains only an empty mount point. Before authentication, the loader obtains `/runtime/shell.json`, a client delivery plan for the Easel shell component kit. Its declared JSON definitions and browser library are publicly available under `/runtime/shell/`; game package resources retain their authentication and access checks. Both stages use the same package loading, interface registration, contract validation, and component management code.

The session controller creates the shell, header, sign-in form, provider list and links, connection status, retry, and sign-out using `Easel.Components`. The sign-in implementation owns its internal form elements and emits declared local `submitted` and `modeChanged` events. The controller uses those events and component property updates to call the existing accounts API; it never manipulates their private DOM.

`mountRoot(handle)` initially mounts the shell into the loader's DOM container. For game entries, it attaches the game's root component into the shell session component's declared `game` slot, using the same interface registry and component manager. Startup fails if the game never mounts its own root, even when the shell is already mounted. Mount and unmount callbacks follow actual containment in the mounted tree. Moving preserves the existing implementation instance and private state.

A component event stays local to its handle. Only an explicit `Application.events.emit` sends a game action to the server. Received application events invoke `Application.events.on` handlers without being sent back. Emission returns a Promise resolved by server acceptance or rejected by a correlated error or disconnect. The first local application listener creates a server subscription; removing the last listener removes it.

Runtime replacement of mounted implementations is deferred. Choose a host at creation time. Components may render with HTML, SVG, Canvas, WebGL, or other browser facilities internally. No base class is required.

On connection loss, outstanding requests reject and game component instances are destroyed. The shell survives to display status and recovery controls. The loader then reloads the page and performs authentication, negotiation, initialization, and subscriptions again. HTTP validators allow cached resource reuse. Unacknowledged actions are never automatically retried. Games obtain authoritative state through their application events or established state facilities; there is no event replay guarantee.
