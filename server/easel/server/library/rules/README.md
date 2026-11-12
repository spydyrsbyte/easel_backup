# easel.rules

Small evaluation building blocks, not a general replacement for Easel automations or a universal rules engine.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.rules.predicate@1` | server | [contracts/predicate.server.md](contracts/predicate.server.md) |
| `easel.rules.modifier@1` | server | [contracts/modifier.server.md](contracts/modifier.server.md) |
| `easel.rules.threshold@1` | server | [contracts/threshold.server.md](contracts/threshold.server.md) |
| `easel.rules.lookup@1` | server | [contracts/lookup.server.md](contracts/lookup.server.md) |
| `easel.rules.modifierlist@1` | client | [interfaces/modifierlist.json](interfaces/modifierlist.json) |
| `easel.rules.outcome@1` | client | [interfaces/outcome.json](interfaces/outcome.json) |
| `easel.rules.condition@1` | client | [interfaces/condition.json](interfaces/condition.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
