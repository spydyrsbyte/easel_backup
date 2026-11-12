# easel.resources

Balances, prices and conversions shared by RPGs, card games and Eurogames.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.resources.pool@1` | server | [contracts/pool.server.md](contracts/pool.server.md) |
| `easel.resources.cost@1` | server | [contracts/cost.server.md](contracts/cost.server.md) |
| `easel.resources.exchange@1` | server | [contracts/exchange.server.md](contracts/exchange.server.md) |
| `easel.resources.resource@1` | client | [interfaces/resource.json](interfaces/resource.json) |
| `easel.resources.pool@1` | client | [interfaces/pool.json](interfaces/pool.json) |
| `easel.resources.cost@1` | client | [interfaces/cost.json](interfaces/cost.json) |
| `easel.resources.exchange@1` | client | [interfaces/exchange.json](interfaces/exchange.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
