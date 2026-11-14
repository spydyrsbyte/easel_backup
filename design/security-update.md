
## Types

Security checks every type name a security file uses against three sources:

- **Record types** from the composed data schema, always by full name, such as `easel.pathfinder.Character`.
- **`easel.easel.User`**, the built-in type of every user.
- **Group types** that a security file registers with `registerGroupType`. A group type always belongs to the registering package's host: `registerGroupType("Party")` in `easel.pathfinder.game` defines `easel.pathfinder.Party`. Naming another host is rejected, and so is a group type that reuses a record type's name or `easel.easel.User`.

Users and groups are security principals stored in `security_principals`. They are never records and never declared in `data`. Type names are checked when registration closes, so a group type can be registered after a relationship that names it.

When PostgreSQL holds the records, `security.RecordResolver(pgstore.RecordView)` gives policies each record's real type and stored fields, read inside the authorization transaction.

Policies and relationships match a record's type and every type it extends. A subtype declared with `.extends` inherits its parent's fields, classes, policies, and relationships: a policy for `easel.vtt.Actor` also covers `easel.pf1e.Creature`, which extends it. Every matching policy is evaluated, so a subtype's own policies can add access and a `deny` in any of them removes it. Runtime permissions still match a record's exact type only.
