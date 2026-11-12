# easel.narrative

Text/scene/story presentations and general collaborative note utilities.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.narrative.scene@1` | server | [contracts/scene.server.md](contracts/scene.server.md) |
| `easel.narrative.journal@1` | server | [contracts/journal.server.md](contracts/journal.server.md) |
| `easel.narrative.tags@1` | server | [contracts/tags.server.md](contracts/tags.server.md) |
| `easel.narrative.journal@1` | client | [interfaces/journal.json](interfaces/journal.json) |
| `easel.narrative.scene@1` | client | [interfaces/scene.json](interfaces/scene.json) |
| `easel.narrative.handout@1` | client | [interfaces/handout.json](interfaces/handout.json) |
| `easel.narrative.relationship@1` | client | [interfaces/relationship.json](interfaces/relationship.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
