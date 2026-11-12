# easel.networks

Graph and route primitives for train games, trade paths, skill trees and map navigation.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.networks.graph@1` | server | [contracts/graph.server.md](contracts/graph.server.md) |
| `easel.networks.route@1` | server | [contracts/route.server.md](contracts/route.server.md) |
| `easel.networks.capacity@1` | server | [contracts/capacity.server.md](contracts/capacity.server.md) |
| `easel.networks.network@1` | client | [interfaces/network.json](interfaces/network.json) |
| `easel.networks.route@1` | client | [interfaces/route.json](interfaces/route.json) |
| `easel.networks.node@1` | client | [interfaces/node.json](interfaces/node.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
