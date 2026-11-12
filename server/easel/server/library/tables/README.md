# easel.tables

Lookup, weighted-choice and reference-table utilities, from loot tables to board-game events.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.tables.lookup@1` | server | [contracts/lookup.server.md](contracts/lookup.server.md) |
| `easel.tables.weighted@1` | server | [contracts/weighted.server.md](contracts/weighted.server.md) |
| `easel.tables.rolltable@1` | server | [contracts/rolltable.server.md](contracts/rolltable.server.md) |
| `easel.tables.table@1` | client | [interfaces/table.json](interfaces/table.json) |
| `easel.tables.rolltable@1` | client | [interfaces/rolltable.json](interfaces/rolltable.json) |
| `easel.tables.entry@1` | client | [interfaces/entry.json](interfaces/entry.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
