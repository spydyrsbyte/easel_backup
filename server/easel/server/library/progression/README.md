# easel.progression

Independent advancement trees, budgets, point buy and milestone utilities.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.progression.tree@1` | server | [contracts/tree.server.md](contracts/tree.server.md) |
| `easel.progression.budget@1` | server | [contracts/budget.server.md](contracts/budget.server.md) |
| `easel.progression.milestone@1` | server | [contracts/milestone.server.md](contracts/milestone.server.md) |
| `easel.progression.allocation@1` | server | [contracts/allocation.server.md](contracts/allocation.server.md) |
| `easel.progression.tree@1` | client | [interfaces/tree.json](interfaces/tree.json) |
| `easel.progression.pointbuy@1` | client | [interfaces/pointbuy.json](interfaces/pointbuy.json) |
| `easel.progression.milestones@1` | client | [interfaces/milestones.json](interfaces/milestones.json) |
| `easel.progression.buildsummary@1` | client | [interfaces/buildsummary.json](interfaces/buildsummary.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
