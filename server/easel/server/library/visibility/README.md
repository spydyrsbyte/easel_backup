# easel.visibility

Viewer-specific projection and disclosure helpers for game information; not database field ACLs.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.visibility.projection@1` | server | [contracts/projection.server.md](contracts/projection.server.md) |
| `easel.visibility.disclosure@1` | server | [contracts/disclosure.server.md](contracts/disclosure.server.md) |
| `easel.visibility.concealed@1` | client | [interfaces/concealed.json](interfaces/concealed.json) |
| `easel.visibility.mask@1` | client | [interfaces/mask.json](interfaces/mask.json) |
| `easel.visibility.reveal@1` | client | [interfaces/reveal.json](interfaces/reveal.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
