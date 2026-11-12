# Data Schema

Packages contribute declarative schema rules to a game. The game preserves those rules in PostgreSQL independently of installed package code. Go composes the saved rules into one schema and validates every record against it. No JavaScript runs during validation.

## Declaring types

A manifest lists declarations under `data`. Each entry is an inline declaration or a file reference, and both can be used together:

```json
"data": [
  {".name": "character", "hp": {".type": "integer"}},
  {".modify": "easel.acme.character", "mana": {".type": "integer"}},
  {".file": "./data/types.json"}
]
```

A data file holds a JSON list of the same inline declarations.

## Meta keys

In `data`, and only in `data`, every key that starts with a dot is meta. Any key without a dot is a field. Unrecognized meta keys are valid and are kept as they are. This version gives these meta keys a meaning:

| Key | Where | Meaning |
|---|---|---|
| `.name` | declaration | Defines a type, published as `host.name`. |
| `.modify` | declaration | Adds fields to an existing type. An unqualified name means the package's own host. |
| `.extends` | declaration with `.name` | The new type starts with every composed field of the named type and counts as that type for references. |
| `.file` | declaration | Loads declarations from a file in the package. |
| `.type` | field | The field's type. |
| `.required` | field | `false` makes the field optional. Fields are required by default. |
| `.default` | field | The value a new record starts with. |
| `.validate` | field | Rules the value must satisfy. |
| `.size` | array, set, map field | `{min, max}` number of elements. |
| `.keys` | map field | Rules every key must satisfy. |

## Types

| Type | Value |
|---|---|
| `string` | text |
| `boolean` | true or false |
| `integer` | whole number within 64 bits |
| `number` | finite number |
| `decimal` | exact decimal number |
| `datetime` | RFC 3339 timestamp |
| `null` | null |
| `field` | nested fields, written as non-dot keys beside the meta |
| `array` | ordered list |
| `set` | list with no repeated values |
| `map` | object with arbitrary keys |
| `*name` | the ID of a record of type `name`; unqualified means the package's own host, `*host.name` names another package's type |

For `array`, `set`, and `map`, `.validate` applies to each element. For a map, that's each value.

## Validation rules

Every rule in a `.validate` object must pass.

| Rule | Applies to | Meaning |
|---|---|---|
| `.type` | any | The value has this type. |
| `.between: {min, max}` | numbers | Inclusive range. |
| `.min`, `.max` | numbers | Inclusive single bound. |
| `.length: {min, max}` | strings | Inclusive length in characters. |
| `.regex` | strings | Go RE2 regular expression the whole string must match. |
| `.in: [values]` | any | The value equals one of the listed values. |
| `.multipleOf` | numbers | The value is an exact multiple. |
| `.not: {rules}` | any | The nested rules must fail. |
| `.validate: {rules}` | any | Nested rules. |
| `.and: [{rules}]` | any | Every rule set passes. |
| `.or: [{rules}]` | any | At least one rule set passes. |

`.and` and `.or` are exclusive. A `.validate` object containing one of them contains nothing else.

Inside `.between`, `.length`, and `.size`, `min` and `max` have no dot because the object is already meta.

## Field references

A value written `{"@": "path"}` is read from the record instead of being a literal. The path always starts at the root of the type:

```json
"hp": {".type": "integer", ".validate": {".between": {"min": 0, "max": {"@": "health.max"}}}}
```

References work anywhere a rule takes a value. The composer checks that every path exists in the composed type.

## Composition

1. Every `.name` declaration defines a type. Two packages defining the same type is an error.
2. Every `.modify` declaration adds its fields to the target type, in package load order. Adding a field that already exists is an error.
3. Each top-level field belongs to the package that added it. That package owns the field's fragment of every record.

## Storage

Every record has an ID outside its declared fields. A `*name` value is that ID.

Publishing a game build creates a revision in PostgreSQL:
1. Each package is recorded as a contributor, in load order, with its version and a SHA-256 hash of its files.
2. Each declaration is stored as a contribution, `define` or `modify`, with its retained JSON as BSON. Updates retain previously declared fields even when the incoming declaration omits them.
3. Each composed type is stored as an effective schema, in the same dot syntax, with `.owner` on the type and on each top-level field.
4. The revision is sealed, which makes it immutable, and activated.

When a record is saved, Go validates it against the composed schema and checks that every reference points at an existing record of the right type. A field that no fragment holds yet goes to the fragment of the package that declared it.

Event fields can be typed `*host.name`. The value is a record ID, checked the same way.

## Schema lifecycle

The active revision's saved declarations are authoritative. Startup supplies that same composed schema to record storage, generated JavaScript record classes, event validation, and security type inheritance. Package hashes detect changed installations; they do not determine whether saved types and fields exist.

Removing a module from a game's package selection retains its declarations, contributor identity, package version, inheritance, and record fragments in subsequent revisions. An uninstalled optional module that was previously registered with the game is also allowed to remain in its saved selection: startup omits its executable package and retains its schema. Unknown missing modules are rejected when creating a game. Its JavaScript, interfaces, and security policies are not installed by retaining its schema. Executable dependencies still need their required packages. Reinstalling a compatible module reconciles its declarations with the retained rules.

Ordinary updates may add declarations and fields. Omitted declarations and fields remain present. Changing an existing field definition, declaration target, or parent requires an explicit migration. Existing records are checked against a proposed schema before activation, including reference types. A newly required field needs an explicit backfill when records lack it; a creation default does not backfill existing data. Failed reconciliation or validation leaves the active revision and record data unchanged.

Contribution identity currently uses contributor ID and declaration source (`data[n]` or `path[n]`). Reordering declarations or moving them between files can require an explicit migration. Type and field names remain part of their identities; renames require a migration.

### Explicit migration and optional cleanup

`pgstore.Revisions.LoadSchema` reads the active revision, retained contributions, and composed schema without resolving installed modules. `schema.PackageRules` reads incoming package declarations, and `schema.RetainRules` reconciles them with retained contributions.

`games.Manager.MigrateSchema` accepts a `pgstore.SchemaMigration` and requires the game to be stopped. A migration supplies:

- `FromRevision`: the source revision, checked under the game's database lock to reject stale migrations.
- `Rules`: the complete intended set of schema contributions, with source attribution. Rules excluded here are explicitly removed from the new schema.
- `Transform`: a Go function that receives each saved record and returns its converted record. Returning `nil` explicitly deletes that record. Record IDs and input versions must remain unchanged; field names, values, ownership, and concrete record types can be converted.

The migration writes transformed fragments, checks every resulting record and reference, seals the new schema revision, and activates it in one serializable PostgreSQL transaction. A failure rolls back schema publication, updates, and deletions together. Transformations must keep their effects inside the returned record data; external effects are outside that transaction. Previous schema revisions remain immutable. They do not contain previous record values, so reversing a successful data migration requires a reverse transformation or a backup.

Cleanup is optional and uses the same migration path: omit the selected rules, remove or convert their fields, and explicitly delete or convert records whose types are removed. Dangling references prevent activation. Nothing is automatically cleaned up when a module is removed. These are backend APIs; no migration or cleanup screen is provided yet.

## Names

A host must be a JavaScript identifier, because it becomes a global in game code. A type name must be a JavaScript identifier too. The names `id`, `type`, `save`, `remove`, and `_data` are reserved and cannot be top-level fields.

## Subtypes

```json
{".name": "Familiar", ".extends": "easel.pathfinder.Character", "master": {".type": "*easel.pathfinder.Character"}}
```

A subtype starts with its parent's composed fields, including every `.modify` applied to the parent, then adds its own. Redeclaring an inherited field is an error, and so is a cycle. A subtype counts as its parent wherever a reference expects the parent. Inherited fields keep their owners.

## Records in code

Every type becomes a class reachable as `host.Type`, which extends `Easel.Record`:

```js
const hero = new easel.pathfinder.Character();      // creates a record with its defaults
const same = new easel.pathfinder.Character(id);    // loads it, or throws if it does not exist
hero.hp -= 3;
hero.save();                                  // validates and writes it
hero.remove();
```

`id`, `type`, `save()`, and `remove()` come from `Easel.Record`. Every field is a property, nested `field` branches included, backed by the record's data in Go (`this._data`). A property that is not a field throws when it is set.

Changes are written only when `save()` is called. Everything saved during a request commits when the request finishes and rolls back if the request throws. Automation runs started during the request share its transaction.

### Layers

```js
export class Character extends easel.pathfinder.Character {
  frighten(n) { this.fear.level += n; }
  get frightened() { return this.fear.level >= 5; }
  damage(n) { super.damage(n); }
}
```

An exported class with the same name as the type it extends is a layer. Easel stacks the layers in package load order after `Load.Data.PreLoad`, so `super` reaches the layer below, and every record of the type gets every layer. A package has at most one layer per type. A subtype is built on its parent's stacked class, so it gets the parent's layers too.

An exported class with a different name, such as `class Hero extends easel.pathfinder.Character`, is a code-only subclass. Its data is still a `easel.pathfinder.Character`.

A layer can declare a field itself. Easel adds accessors only for stored fields that no layer declares. For a `field` branch, a layer can provide an object, such as `abilities = { strength: { get mod() { ... } } }`, and Easel adds the stored fields into it.

A class field with a stored field's name is an initial value: Easel stores it when the record is created and ignores it when the record is loaded. It wins over `.default`. Any other class field is runtime state that is never saved.

Records are available once `Load.Data.Ready` is dispatched.

### Debug

With `Game.Debug`, Easel collects warnings instead of assuming mistakes: a layer that makes a field read-only with a getter and no setter, a field with both `.default` and a class field, a branch declared by a getter that Easel cannot fill, and a record changed during a request but never saved. `Runtime.Warnings()` returns them.
