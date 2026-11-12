# easel.pieces

Physical-looking movable artifacts: tokens, counters, tiles, meeples and miniatures.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.pieces.orientation@1` | server | [contracts/orientation.server.md](contracts/orientation.server.md) |
| `easel.pieces.stacking@1` | server | [contracts/stacking.server.md](contracts/stacking.server.md) |
| `easel.pieces.faces@1` | server | [contracts/faces.server.md](contracts/faces.server.md) |
| `easel.pieces.token@1` | client | [interfaces/token.json](interfaces/token.json) |
| `easel.pieces.meeple@1` | client | [interfaces/meeple.json](interfaces/meeple.json) |
| `easel.pieces.miniature@1` | client | [interfaces/miniature.json](interfaces/miniature.json) |
| `easel.pieces.tile@1` | client | [interfaces/tile.json](interfaces/tile.json) |
| `easel.pieces.stack@1` | client | [interfaces/stack.json](interfaces/stack.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
