# easel.collections

Independent ordered/unordered member containers, membership queries and transfer primitives.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.collections.ordered@1` | server | [contracts/ordered.server.md](contracts/ordered.server.md) |
| `easel.collections.set@1` | server | [contracts/set.server.md](contracts/set.server.md) |
| `easel.collections.transfer@1` | server | [contracts/transfer.server.md](contracts/transfer.server.md) |
| `easel.collections.partition@1` | server | [contracts/partition.server.md](contracts/partition.server.md) |
| `easel.collections.list@1` | client | [interfaces/list.json](interfaces/list.json) |
| `easel.collections.strip@1` | client | [interfaces/strip.json](interfaces/strip.json) |
| `easel.collections.stack@1` | client | [interfaces/stack.json](interfaces/stack.json) |
| `easel.collections.browser@1` | client | [interfaces/browser.json](interfaces/browser.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
