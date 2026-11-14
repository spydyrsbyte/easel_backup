# Automation

Automations are named, saved programs that Go runs for a game. Each one is a list of steps. A step can load and change game records, call other automations, branch, loop, emit events and return a value. Game code defines them as JSON objects or in a short text syntax. Go stores them, checks permissions, and runs them in one transaction.

Games use automations for state changes that must be checked and atomic. Examples are `easel.board.Move` for chess and checkers and `easel.mtgtable.Commit` for the MTG table.

## Where the code lives

| Path | Responsibility |
| --- | --- |
| [internal/automation/model.go](internal/automation/model.go) | `Definition`, `Step`, `Saved`, `Creator`, the `Repository` / `Access` / `Records` / `Transaction` interfaces, and `Validate` |
| [internal/automation/engine.go](internal/automation/engine.go) | `Service`: `Save`, `Load`, `List`, `Delete`, `Run`, and the step interpreter |
| [internal/automation/value.go](internal/automation/value.go) | Expression evaluation, paths, assignment, exact decimal arithmetic, `Equal` |
| [internal/automation/parser.go](internal/automation/parser.go) | Text syntax parser (`Parse`) and one-line commands (`Command`) |
| [internal/automation/environment.go](internal/automation/environment.go) | Trusted execution context (`WithEnvironment`) |
| [internal/automation/json.go](internal/automation/json.go) | Strict JSON decoding (`UseNumber`, no unknown fields) and deep copies |
| [internal/automation/limits.go](internal/automation/limits.go) | Execution limits |
| [internal/automation/repository.go](internal/automation/repository.go) | `FileRepository` (one JSON file per automation) and the `ErrNotFound`, `ErrDenied` and `ErrPostCommit` errors |
| [internal/automation/pgstore/](internal/automation/pgstore/) | PostgreSQL `Repository` (table `game_data.automations`) and `Records` (game records, which use schema validation and version checks) |
| [internal/jsapi/automations.go](internal/jsapi/automations.go) | The `Application.automations` JavaScript API, binding automations to events, and delivering emitted events |
| [internal/session/session.go](internal/session/session.go) | Seeds and binds automations during game load, and provides Go entry points that run on the session goroutine |
| [internal/games/games.go](internal/games/games.go), [management.go](internal/games/management.go) | Connects hosted games to PostgreSQL and the security policy |
| [internal/security/automation.go](internal/security/automation.go) | `AutomationAccess`, which maps automation actions to security requests |

## Data model

```go
type Definition struct {
    Name       string   // identifier, e.g. "easel.board.Move"
    Parameters []string // positional parameter names
    Event      string   // optional: run automatically when this event fires
    Steps      []Step
}

type Saved struct {
    Definition Definition
    Creator    Creator  // {Kind: "system" | "user", ID: "..."}
}
```

- **Names** must pass `ident.Valid`, which is the same rule as the SQL check `^[A-Za-z_][A-Za-z0-9_.-]*$`. Parameter names must be valid and unique.
- **Creator** owns the name. `Service.Save` refuses to overwrite an automation that belongs to a different creator. When JavaScript calls `define`, the creator is `system` with the package owner's ID, or `user` with the principal's ID if a user is acting.
- **Validation** (`Validate`) runs on every save and load. It checks names, the required fields of each step, and that nesting is no deeper than 64 levels.

## Running an automation

`Service.Run(ctx, name, args)`:

1. Loads the definition, using a per-run cache, and authorizes the `run` action. Every nested `call` is also loaded and authorized for `run`.
2. Checks the number of arguments, then deep-copies them into a new frame. Each call has its own arguments, variables and record aliases.
3. Runs the steps. The first `load` opens a record transaction, unless a shared transaction is already in the context (see below).
4. On success, writes each staged record save in sorted key order. If the run opened its own transaction, it commits it.
5. Returns `Result{Value, Events}`. On any error, the run's own transaction is rolled back and nothing is written.

### Transactions

- **Own transaction**: a run with no shared transaction begins one on its first `load` and commits it at the end.
- **Shared transaction**: `WithTransaction(ctx, tx)` puts a transaction in the context. The JavaScript bridge always does this for record-backed games. In that case the run's saves are written into the request transaction and **not committed**. The request commits when it finishes, or rolls back if it throws. JavaScript record writes and automation writes in one request are therefore atomic together.

### Records inside a run

- `load <type> <id> <alias>` loads a record once per run. A later `load` of the same type and ID, even in a nested call, returns the same in-memory object.
- Changes to the record's fields (for example `set $rec.state ...`) change only the in-memory copy.
- `save <alias>` stages a snapshot of the record **at that moment**. Changes made after the last `save` are dropped.
- The PostgreSQL store checks that the record is of the type requested or a subtype. It authorizes `read` on load and `modify` on save, validates the data against the effective schema, and fails with `version conflict` if another writer saved the record first. In hosted games, code running with server origin skips record authorization.
- A record alias cannot be replaced by `let`, `set`, `call ... -> alias` or a loop variable.

### Events

- `emit` collects `{name, payload}` pairs. The payload must be an object.
- After `Run` succeeds, the bridge emits each event through the shared event engine with origin **automation** (`4`). The event must be registered with `valid` including `4`, for example `Application.events.register("easel.mtgtable.changed", { valid: 4, revision: "integer" })`.
- If an event fails after the data was committed, the error wraps `automation.ErrPostCommit`.

### Event-bound automations

If a definition has `Event`, binding it adds a listener on that event. The event must already be registered, and every parameter name must be a field of that event. When the event fires, the listener reads each parameter from the payload field with the same name and runs the automation. Binding an automation again replaces its listener, and deleting it removes the listener. Binding itself is not authorized, but each run is.

### Execution context

Steps can read trusted request metadata with `{"context": "<field>"}`. The bridge provides these fields:

| Field | Value |
| --- | --- |
| `principal` | ID of the acting user (empty for server code) |
| `game` | Game ID |
| `session` | Session ID |
| `origin` | `server`, `client` or `automation` |

Arguments cannot replace these values. A missing field is an error. Go callers that do not use the bridge must call `automation.WithEnvironment` themselves. Board automations get the acting player this way and never from an argument.

### Limits

| Limit | Default | Where |
| --- | --- | --- |
| Steps per run (all calls and loops combined) | 100,000 | `Service.MaxSteps` |
| Call depth | 64 | `Service.MaxCallDepth` |
| Block nesting | 64 | constant |
| Text source line length | 1 MiB | constant |

Cancelling the context stops a run between steps and between loop iterations.

## Values and expressions

Values are JSON values: null, booleans, strings, numbers, lists and objects. Values are deep-copied when passed as arguments, assigned, returned and emitted, so aliasing is never shared, except for loaded records.

**Numbers** are exact decimals. They are parsed into `big.Rat` and written back as `json.Number`. `0.1 + 0.2` is exactly `0.3`. A result with no finite decimal form, such as `1/3`, is rounded to 16 places. Dividing by zero is an error.

### Value forms

A value position in a step accepts any of the following:

| Form | Meaning |
| --- | --- |
| a plain JSON value | Itself. Lists and objects are evaluated element by element. |
| `{"literal": X}` | `X`, not evaluated |
| `{"arg": "name"}` | A parameter |
| `{"var": "name"}` | A variable. If no variable has that name, it reads the parameter. |
| `{"path": ["name", "field", 0, {...}]}` | Starts at a variable or parameter and then follows object fields and list indexes. Any segment after the first may be an expression. |
| `{"context": "principal"}` | Trusted execution context |
| `{"expr": "op", "args": [...]}` | An expression |

### Expressions

| Operator | Arity | Result |
| --- | --- | --- |
| `and`, `or` | any | Booleans only. Stops at the first value that decides the result. |
| `not` | 1 | Boolean negation |
| `add`, `subtract`, `multiply`, `divide` | 2 | Exact decimal |
| `equals`, `notEquals` | 2 | Deep equality. Numbers compare by value, so `1` equals `1.0`. |
| `lessThan`, `lessOrEqual`, `greaterThan`, `greaterOrEqual` | 2 | Two numbers, or two strings |
| `concat` | any | Joins strings |
| `length` | 1 | Length of a string (in runes), list or object |
| `contains` | 2 | Substring, list member, or object key |
| `get` | 2 | Object field or list index |
| `list` | any | The arguments as a list |
| `split`, `join` | 2 | String ↔ list of strings |
| `keys` | 1 | Sorted keys of an object |
| `exists` | 1 | `true` if evaluating the argument does not fail, for example to test whether a path exists |

## Steps

| Op | Fields | Effect |
| --- | --- | --- |
| `fields` | `names` | Declares variables as `null` if they do not exist yet |
| `let` | `name`, `value` | Sets a variable |
| `set` | `target`, `value` | Assigns to a `var` or `path` target |
| `delta` | `target`, `value` | `target += value` |
| `multiply` | `target`, `value` | `target *= value` |
| `append` | `target`, `value` | Adds a value to the end of a list |
| `remove` | `target`, `value` | Removes the item at index `value` from a list |
| `load` | `type`, `id`, `as` | Loads a record under an alias |
| `save` | `record` | Stages the record alias for writing |
| `compare` | `condition` | If the condition is false, **skips the next step** |
| `check` | `condition`, `message` | If the condition is false, fails the run with `check failed: <message>` |
| `if` | `condition`, `then`, `else` | Branches |
| `block` | `steps` | Groups steps |
| `each` | `value`, `item`, `index?`, `steps` | Loops over a list. The loop variables are restored afterwards. |
| `call` | `name`, `args`, `as?` | Runs another automation, optionally storing its return value |
| `emit` | `name`, `value` | Queues an event. `value` must be an object. |
| `return` | `value?` | Ends the current automation with a value |

Conditions must evaluate to booleans. A `return` inside `if`, `block` or `each` ends the whole automation.

## Text syntax

`automation.Parse` (and `Application.automations.parse` in JavaScript) turns text into `Definition`s. One source string can hold several definitions.

```text
# Comments start with # at any point where a new token could start
d:add a b
let sum {"expr":"add","args":[{"var":"a"},{"var":"b"}]}
return $sum

d:sum list
let total 0
each $list item
  delta $total $item
endblock
e:summed {"ok":true}
return $total

d:greet name
event joined
e:greeted {"text":"hi"}
```

| Line | Meaning |
| --- | --- |
| `d:name p1 p2 ...` | Starts a definition |
| `event name` | Optional. Must be the line directly after `d:`. Binds the definition to an event. |
| `let $x value` | `let` |
| `set` / `delta` / `multiply` / `append` / `remove` `target value` | The matching op |
| `load Type id alias` | `load` |
| `save $alias` | `save` |
| `compare left OP right` | `OP` is one of `==`, `!=`, `<`, `<=`, `>`, `>=`. Skips the next line if false. |
| `block` … `endblock` | `block` |
| `each $list item [index]` … `endblock` | `each` |
| `.name args... [-> $result]` | `call`. `call name args... [-> $result]` also works. |
| `e:name {payload}` | `emit` |
| `return [value]` | `return` |

Tokens are separated by spaces. Text inside quotes, `[...]` or `{...}` stays one token.

- `$x` becomes `{"var":"x"}`.
- `$x.a.b` becomes `{"path":["x","a","b"]}`. Path segments are always strings, so text paths cannot index into lists. Use JSON for that.
- Other tokens are read as JSON (`1`, `true`, `"hi"`, `[1,2]`). `$` references are not expanded inside JSON, so write `{"var":"x"}` there. A token that is not valid JSON and does not start with `"`, `[` or `{` is a bare string.

**`if` and `check` are available only in JSON definitions.** The text syntax supports conditions only through `compare`.

### One-line commands

`Service.Command(ctx, ".add 2 3")` runs an automation directly. Its arguments must be literals. `$` references are not allowed.

## JavaScript API: `Application.automations`

Installed on the game runtime by `EventBridge.InstallAutomations`.

| Method | Description |
| --- | --- |
| `define(definition)` | Saves a JSON definition and binds its event, if any |
| `parse(text)` | Returns the definitions parsed from text. Does not save them. |
| `run(name, args?)` | Runs the automation and returns its value. Joins the request transaction. |
| `command(text)` | Runs a one-line command |
| `get(name)` | Returns `{definition, creator}` |
| `list()` | Returns the automations the caller is allowed to read |
| `remove(name)` | Deletes an automation and its event listener |

Games normally define their automations in a `Load.Automation.Ready` listener. This example is from [server/easel/applications/mtgtable/server/application.mjs](server/easel/applications/mtgtable/server/application.mjs):

```js
Server.events.on("Load.Automation.Ready", () =>
  Application.automations.define({
    name: "easel.mtgtable.Commit",
    parameters: ["table", "revision", "next"],
    steps: [
      { op: "load", type: "easel.mtgtable.Table", id: { arg: "table" }, as: "record" },
      { op: "check",
        condition: { expr: "equals", args: [{ path: ["record", "revision"] }, { arg: "revision" }] },
        message: "The table changed. Refresh and try again." },
      { op: "set", target: { path: ["record", "state"] }, value: { arg: "next" } },
      { op: "delta", target: { path: ["record", "revision"] }, value: 1 },
      { op: "save", record: "record" },
      { op: "emit", name: "easel.mtgtable.changed", value: { revision: { path: ["record", "revision"] } } },
    ],
  }),
);

Application.automations.run("easel.mtgtable.Commit", [tableID, record.revision, state]);
```

For large rule sets, build the JSON with small helper functions. [server/easel/modules/board/server/automations.mjs](server/easel/modules/board/server/automations.mjs) defines `v`, `a`, `p`, `e`, `eq` and `branch`, and builds the chess and checkers rules from them.

## Go API

The session (`internal/session`) offers `RunAutomation`, `AutomationCommand`, `SaveAutomation`, `ListAutomations`, `DeleteAutomation` and `EmitAutomation`. Each call runs on the session goroutine with origin `automation`. A `Service` can also be used on its own:

```go
service := automation.New(&automation.FileRepository{Directory: dir}, records, automation.AllowAllStub{})
result, err := service.Run(ctx, "add", []any{json.Number("2"), json.Number("3")})
```

## Game load lifecycle

During `session.NewGame`:

1. **`Load.Automation.PreLoad`**: each definition in `Game.Automations` is saved if the repository does not already have it. Then every stored **system** automation is bound to its event.
2. **`Load.Automation.Ready`**: game code calls `Application.automations.define(...)`.
3. **`Load.Automation.Users.PreLoad`**: every stored **user** automation is bound.

If `Game.Automations` is not empty and no automation service is configured, the game fails to load.

## Security

`Service` always requires an `Access` policy. With a nil policy, every operation fails with `access policy missing`. `AllowAllStub` exists for development and tests, and `InstallAutomations` rejects it when the game has security enabled.

Actions checked:

| Action | When |
| --- | --- |
| `read` | `Load` and `List`. `List` leaves out automations that return `ErrDenied` and passes any other error up. |
| `run` | Every `Run`, and every nested `call` |
| `save`, `delete` | Writes. If the repository implements `WriteGuard` and returns `AuthorizesWrites() == true`, the repository authorizes writes itself, inside its own transaction. |

In hosted games (`internal/games`):

- **Server code defining its own automations** passes without a check. This covers code with server origin, no principal and a `system` creator.
- **Everything else** needs the permission `automation.<action>` on resource `type:easel.easel.User`, with `{name}` in the request context. Each game registers these actions and policies in its `security.mjs`:

  ```js
  for (const action of ["run", "read"]) {
    Security.registerAction("easel.easel.User", "automation." + action);
    Security.registerPolicy("mtgtable.automation." + action, {
      resource: "easel.easel.User", action: "automation." + action, allow: member,
    });
  }
  ```

- **Writes through PostgreSQL** (`pgstore.Repository.AuthorizeWrite`) are currently allowed only for that server/system case. Users cannot save or delete automations in a hosted game.
- Inside a run, records are authorized by their own rules (`read` and `modify` on the record) unless the origin is server.

## Storage

- **`FileRepository`** stores `<Directory>/<name>.json` and writes each file atomically (temp file, then rename). Tests use it.
- **`pgstore.Repository`** stores rows in `game_data.automations (game_id, name, creator_kind, creator_id, definition jsonb)` with primary key `(game_id, name)`. It saves with `ON CONFLICT ... WHERE` creator matches, so another creator's row is never overwritten. Deletes lock the row with `FOR UPDATE` in a serializable transaction. The table is defined in [server/easel/database/schema.sql](server/easel/database/schema.sql).

## Errors

- `automation.ErrNotFound`: no automation has that name
- `automation.ErrDenied`: the access policy denied the action
- `automation.ErrPostCommit`: the data was committed, but delivering an emitted event failed

Runtime errors are wrapped with their location, for example `automation easel.board.Move: step 4 (check): check failed: Not your turn`.

## Tests

- [internal/automation/engine_test.go](internal/automation/engine_test.go): arithmetic, commands, loops, emits, limits, filtering in `List`, calls loaded on demand, shared transactions
- [internal/automation/parser_test.go](internal/automation/parser_test.go): text syntax and parse errors
- [internal/automation/environment_test.go](internal/automation/environment_test.go): arguments cannot replace context values
- [internal/automation/pgstore/postgres_test.go](internal/automation/pgstore/postgres_test.go): the PostgreSQL stores
- End-to-end: `internal/server/board_test.go` and `internal/server/magic_test.go`
