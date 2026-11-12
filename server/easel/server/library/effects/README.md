# easel.effects

Status/effect presentation and timing helpers, with game-defined meaning.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.effects.duration@1` | server | [contracts/duration.server.md](contracts/duration.server.md) |
| `easel.effects.stacking@1` | server | [contracts/stacking.server.md](contracts/stacking.server.md) |
| `easel.effects.status@1` | server | [contracts/status.server.md](contracts/status.server.md) |
| `easel.effects.status@1` | client | [interfaces/status.json](interfaces/status.json) |
| `easel.effects.effectlist@1` | client | [interfaces/effectlist.json](interfaces/effectlist.json) |
| `easel.effects.duration@1` | client | [interfaces/duration.json](interfaces/duration.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
