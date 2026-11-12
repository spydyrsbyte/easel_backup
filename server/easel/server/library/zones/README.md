# easel.zones

Spatial or logical regions used as drop targets, attachment points or group boundaries.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.zones.zone@1` | server | [contracts/zone.server.md](contracts/zone.server.md) |
| `easel.zones.slots@1` | server | [contracts/slots.server.md](contracts/slots.server.md) |
| `easel.zones.region@1` | client | [interfaces/region.json](interfaces/region.json) |
| `easel.zones.dropzone@1` | client | [interfaces/dropzone.json](interfaces/dropzone.json) |
| `easel.zones.slots@1` | client | [interfaces/slots.json](interfaces/slots.json) |
| `easel.zones.highlight@1` | client | [interfaces/highlight.json](interfaces/highlight.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
