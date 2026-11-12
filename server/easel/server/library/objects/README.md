# easel.objects

Generic identity, metadata and presentation helpers; not a mandatory base class for every game record.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.objects.reference@1` | server | [contracts/reference.server.md](contracts/reference.server.md) |
| `easel.objects.properties@1` | server | [contracts/properties.server.md](contracts/properties.server.md) |
| `easel.objects.transform@1` | server | [contracts/transform.server.md](contracts/transform.server.md) |
| `easel.objects.inspector@1` | client | [interfaces/inspector.json](interfaces/inspector.json) |
| `easel.objects.propertylist@1` | client | [interfaces/propertylist.json](interfaces/propertylist.json) |
| `easel.objects.objecticon@1` | client | [interfaces/objecticon.json](interfaces/objecticon.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
