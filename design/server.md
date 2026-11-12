# Easel Server Architecture

> Status: built. Game files (section 2) have folders but nothing stores files in them yet, and the browser client does not handle challenges yet.

## 1. Purpose

Easel runs in two levels:

- **The server** is a package-driven application that runs Easel itself. It decides who can sign in, what games exist, and which game each connection joins.
- **Games** are what people play. A game is not an application: it's an instance played with an installed application and its modules, with its own records and files. The server creates games, starts them, and routes clients into them.

Both levels use the same package format, the same runtime, and the same client protocol. The server application is simply the one with server-level powers.

## 2. Folder layout

```
server/
  config/                     database and sign-in settings
  easel/                      everything that is Easel
    applications/             installed applications
    modules/                  installed modules and kits
    server/                   server definitions and global libraries
      server.json             which server to start, and the global libraries
      easel/                  a server definition
        manifest.json
        application/          the server application
        modules/              modules it loads
      test/                   another server definition
        application/
        modules/
      library/                global libraries, one folder each (for example core/)
        core/
    templates/                the browser entry page and page-level styles
    database/                 the canonical database schema
  games/                      every game, one folder each
```

`easel/` holds what is installed. `games/` holds what is played. There can be several server definitions side by side, and `server.json` picks the one this Easel instance boots.

### Files

Binary files, such as images, sounds, and maps, are never stored in the database.

- **Package files** ship with a package and stay in its folder under `easel/`. Clients receive them through the client asset routes.
- **Game files** are created or received while a game runs, such as an uploaded portrait or a drawn map. They are stored in that game's folder under `games/`. The database holds only a reference to each file: its location or content hash, type, size, and owner, so permissions and validation still go through the database.

## 3. `server.json`

```json
{
  "startup": "./easel/manifest.json",
  "library": [
    {"name": "core", "manifest": "./library/core/manifest.json"}
  ]
}
```

| Key | Meaning |
|---|---|
| `startup` | The manifest of the server definition to boot, relative to `server.json` |
| `library` | The global libraries. Each entry labels a library and points to its manifest, relative to `server.json`. This configuration label does not set its namespace; the manifest?s stable `owner` and `host` do. |

### Global libraries

A global library is available to every server and game application without being listed in `required`. Like every library, it loads lazily: its code first runs when something asks for an interface it declares or implements. A global library's `data` and security are part of every composition that uses it.

## 4. The server application

The server application is a package with the normal manifest and runtime: library and application stages, `Load.*` events, data, and security. Its definition also loads every package in the definition's `modules/` folder. It differs from a game in two ways:

- it starts when Easel starts, and stops when Easel stops;
- its `Server` global has the server-level APIs (section 6) in addition to `Server.events`. A game's `Server` global has only `Server.events`.

Clients reach it the same way they reach a game. A signed-in connection that no `signedIn` hook routes into a game is in the server application: it receives the server application's `welcome` with its client packages, and exchanges events with it. Every signed-in user may send the events the server application registers for clients and receive its events. The server application decides what each request may do.

### 4.1 Moving between levels

A connection is in one level at a time: the server application or one game.

- `connection.join(gameId)` (section 6.4), called from a hook or from a client event listener, moves the connection into the game. When the call that joined returns, the server ends the connection's subscriptions and sends the game's `welcome`, with `game` set to the game's id. A `welcome` that answers no request has no `replyTo`.
- The client frame `leave` moves the connection from a game back to the server application. The server replies with the server application's `welcome`.

After each `welcome` the client loads that level's packages, subscribes, and sends `ready` again.

## 5. Authentication in the client protocol

Every kind of client signs in the same way, over its client connection. The browser's HTTP routes become a convenience layer over the same core, not the definition of sign-in.

### 5.1 Responsibilities

| Go | Server application |
|---|---|
| Stores accounts, password hashes, and linked identities | Decides whether a sign-in or sign-up is allowed |
| Verifies passwords, rate-limits failures, exchanges provider codes | Adds challenges, such as an invite code or a second-factor code |
| Issues, checks, and revokes session tokens | Decides where a signed-in connection goes |

The application never sees a password or a provider secret. Go reports the verified identity, and the application approves or refuses it.

### 5.2 Session tokens

A session is a random token issued by Go. The database stores only its hash, as it does today. Each client stores the token its own way: the browser in a cookie or storage, and Android in its secure storage. On reconnect, the client presents the token in `hello`.

### 5.3 Messages

Authentication frames travel on the same WebSocket as everything else, before the connection is bound to a game. Client frames carry their data in `payload`.

| Direction | Frame | Meaning |
|---|---|---|
| client → server | `hello` | Protocol version, and optionally a session `token`. The client type is the socket path, such as `/client/http`. |
| server → client | `auth.required` | Reply to `hello` when there is no valid token. Lists the sign-in `methods` and `providers` on offer. |
| client → server | `auth.signin` | `{method: "password", username, password}` or `{method: "provider", provider, code, verifier, redirect}` |
| client → server | `auth.signup` | `{username, password, displayName}` |
| server → client | `auth.challenge` | The application needs more, such as `{challenge: "invite"}` |
| client → server | `auth.response` | `{response}`, the response to the current challenge |
| server → client | `auth.session` | `{token, expires, user}`. The client stores the token. |
| server → client | `auth.refused` | `{reason}`. The client may try again on the same connection. |
| client → server | `auth.signout` | Revokes the current token and closes the connection |
| client → server | `leave` | Leave the current game and return to the server application (section 4.1) |

When `hello` carries a valid token, the server replies with `welcome` directly. Otherwise it replies with `auth.required`, and after `auth.session` it sends `welcome` as the reply to the original `hello`. Any other frame before sign-in is answered with the `auth.required` error and closes the connection. The browser client may rely on its session cookie instead of a `hello` token.

The browser's HTTP routes answer the same way: `POST /api/accounts` and `POST /api/sessions` return the user and set the cookie, `403 {error}` for a refusal, or `202 {challenge, challengeToken}` for a challenge. The client responds with `POST /api/sessions/response {challengeToken, response}`. A provider sign-in that is challenged redirects to `/#challenge=…&challengeToken=…`.

### 5.4 Outside providers

Provider sign-in needs a redirect, so the client gets the code its own way: the browser through `/auth/{provider}/start`, and Android through the platform's sign-in flow. The client then sends the code, the PKCE verifier, and the redirect it used in `auth.signin`. Go exchanges the code and verifies the identity, the same way for every client.

## 6. The `Server` API

Available only in the server application's runtime.

### 6.1 `Server.auth`

```js
Server.auth.on("signIn", (signIn) => {
  if (isBanned(signIn.user.id)) return signIn.refuse("This account is banned.");
  return signIn.allow();
});
Server.auth.on("signUp", (signUp) => signUp.challenge("invite"));
Server.auth.on("response", (response) => response.challengeName === "invite" && validInvite(response.value) ? response.allow() : response.refuse("Invalid invite."));
```

| Hook | When | Fields |
|---|---|---|
| `signIn` | After Go verifies a password or a provider identity | `client`, `method`, `user`, and `provider` for a provider |
| `signUp` | Before Go creates an account | `client`, `method`, `displayName`, and `username` for a password or `provider` for a provider |
| `response` | When a client responds to a challenge | The original sign-in's or sign-up's fields, plus `hook` (`"signIn"` or `"signUp"`), `challengeName`, and `value` (what the user responded) |
| `signedIn` | After a session is issued | `client`, `user` |

Hooks are synchronous. Each returns `allow()`, `refuse(reason)`, or `challenge(name)` on the object it receives, or returns nothing to leave the decision to the next hook. The first decision wins. A sign-in, sign-up, or response that no hook decides is refused. A `signedIn` that no hook decides is allowed, and a refused `signedIn` revokes the new session. A challenge stays open for ten minutes and can be responded to once. Challenges are optional: the default server application never issues one.

The default server application allows every sign-in and sign-up.

### 6.2 `Server.games`

| Call | Meaning |
|---|---|
| `create({name, application, modules, access})` | Create a game that plays an installed application with the given modules. `access` is `"open"` or `"invite"` (section 6.3). It gets its own folder, `games/<game id>/`. Returns the game. |
| `setAccess(id, access)` | Switch a game between `"open"` and `"invite"` |
| `start(id)` / `stop(id)` | Start or stop the game's session. Stopping a game closes its connections. |
| `list()` / `get(id)` | Games on this server, each `{id, name, application, modules, access, running}` |

The calls are synchronous and throw on failure, such as an application or module that isn't installed, or starting a game that is already running.

A game's packages are resolved, composed, and published as a revision when it's created. When it starts, a new revision is published only if its installed packages have changed. Global libraries are always available to it.

A started game keeps its records and security in the database. Code the game runs for itself, on the server's origin, may read and write any record; a client or automation origin needs a permission or policy that allows it. Members may send the events the game registers for clients and receive its events.

### 6.3 Membership

Each game is either open or members-only:

| Access | How a user becomes a member |
|---|---|
| `"open"` | By joining it. A signed-in user who joins becomes a member. |
| `"invite"` | Members only. A table administrator adds the user with `addMember`; joining without membership is refused. The stored value is `"invite"`; the lobby shows it as "Members only". |

| Call | Meaning |
|---|---|
| `Server.games.addMember(gameId, userId)` | Make a user a member straight away, with the player role. Adding an existing member does nothing. |
| `Server.games.members(gameId)` | The game's members, each `{id, displayName}` |
| `Server.games.remove(gameId, userId)` | Remove a member from a game |

Becoming a member creates the user's `easel.easel.User` principal in that game. A member who is removed loses access at once: their connections to the game are closed, and their principal is removed. In an open game, a removed user can join again unless the server application refuses them. Who may add members to or remove them from a game is decided by the server application, the same way it decides sign-ins.

### 6.4 `Server.connections`

```js
Server.connections.on("ready", (connection) => connection.send("lobby.state", state(connection.user)));
Application.events.on("lobby.join", ({ game }, connection) => connection.join(game));
```

| Hook | When |
|---|---|
| `signedIn` | After sign-in, before the connection's first `welcome` |
| `ready` | When a connection in the server application sends `ready` |

The server application's event listeners receive the sending connection as a second argument when a client sends the event.

A connection exposes:

| Member | Meaning |
|---|---|
| `user` | `{id, displayName}` |
| `client` | The client type, such as `http` |
| `join(gameId)` | Move the connection into a running game (section 4.1) |
| `send(name, payload)` | Deliver an event the server application registered to this connection only. The payload is validated like an emission from the server. |

In an open game, `join` makes the user a member if they aren't one already. In a members-only game, `join` succeeds only for members; otherwise it throws. A connection joins at most one game per call, and the first hook that joins ends routing.

If the server application has no client entry for the connection's client type, an unrouted connection's `hello` is answered with the `game.none` error, and so is every later frame except `auth.signout`. If a `signedIn` hook throws, `hello` is answered with `game.unavailable`.

### 6.5 `Server.users`

| Call | Meaning |
|---|---|
| `get(id)` | `{id, displayName, admin}` |
| `admins()` | The administrators, each `{id, displayName}` |
| `setAdmin(id, admin)` | Make a user an administrator, or stop them being one |

Go stores administrators with the accounts. What an administrator may do is decided by the server application.

`Server.games.installed()` returns `{applications, modules}`: each installed application as `{id, requires}`, where `requires` lists the modules it needs, and the ids of the installed modules.

### 6.6 The default server application

The default server application:

- creates an open game named "Demo table" the first time it starts, and starts every game when Easel starts;
- makes the first user who connects an administrator while there is none;
- sends each connection in the server application a lobby (the `easel.easel.lobby` kit in its `modules/` folder) that lists the games and joins one;
- lets administrators create, start, and stop games from the lobby.

## 7. Boundaries

- Games never receive the `Server` global or a connection, so they can't sign people in, create games, add or remove members, or move connections.
- Only members can enter a game. In an open game, joining makes a member; in a members-only game, only a table administrator can add members.
- Passwords, provider secrets, and token hashes never reach JavaScript, at either level.
- The HTTP account routes remain for browsers, but they call the same Go core and the same `Server.auth` hooks as the protocol. There is one sign-in system.
