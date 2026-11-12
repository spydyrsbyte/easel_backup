# easel.tracks

Independent value, progress, segmented-clock and meter primitives.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.tracks.counter@1` | server | [contracts/counter.server.md](contracts/counter.server.md) |
| `easel.tracks.progress@1` | server | [contracts/progress.server.md](contracts/progress.server.md) |
| `easel.tracks.clock@1` | server | [contracts/clock.server.md](contracts/clock.server.md) |
| `easel.tracks.threshold@1` | server | [contracts/threshold.server.md](contracts/threshold.server.md) |
| `easel.tracks.counter@1` | client | [interfaces/counter.json](interfaces/counter.json) |
| `easel.tracks.meter@1` | client | [interfaces/meter.json](interfaces/meter.json) |
| `easel.tracks.clock@1` | client | [interfaces/clock.json](interfaces/clock.json) |
| `easel.tracks.track@1` | client | [interfaces/track.json](interfaces/track.json) |
| `easel.tracks.timer@1` | client | [interfaces/timer.json](interfaces/timer.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
