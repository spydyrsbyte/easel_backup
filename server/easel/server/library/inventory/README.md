# easel.inventory

Item organization and equipment displays; actual membership may use Collections.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.inventory.capacity@1` | server | [contracts/capacity.server.md](contracts/capacity.server.md) |
| `easel.inventory.equipment@1` | server | [contracts/equipment.server.md](contracts/equipment.server.md) |
| `easel.inventory.container@1` | server | [contracts/container.server.md](contracts/container.server.md) |
| `easel.inventory.inventory@1` | client | [interfaces/inventory.json](interfaces/inventory.json) |
| `easel.inventory.equipment@1` | client | [interfaces/equipment.json](interfaces/equipment.json) |
| `easel.inventory.container@1` | client | [interfaces/container.json](interfaces/container.json) |
| `easel.inventory.item@1` | client | [interfaces/item.json](interfaces/item.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
