# easel.maps

Exploration/tactical spatial representations, separate from any mandatory combat subsystem.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.maps.terrain@1` | server | [contracts/terrain.server.md](contracts/terrain.server.md) |
| `easel.maps.geometry@1` | server | [contracts/geometry.server.md](contracts/geometry.server.md) |
| `easel.maps.path@1` | server | [contracts/path.server.md](contracts/path.server.md) |
| `easel.maps.vision@1` | server | [contracts/vision.server.md](contracts/vision.server.md) |
| `easel.maps.template@1` | server | [contracts/template.server.md](contracts/template.server.md) |
| `easel.maps.map@1` | client | [interfaces/map.json](interfaces/map.json) |
| `easel.maps.ruler@1` | client | [interfaces/ruler.json](interfaces/ruler.json) |
| `easel.maps.fog@1` | client | [interfaces/fog.json](interfaces/fog.json) |
| `easel.maps.waypoint@1` | client | [interfaces/waypoint.json](interfaces/waypoint.json) |
| `easel.maps.template@1` | client | [interfaces/template.json](interfaces/template.json) |
| `easel.maps.shadowbox@1` | client | [interfaces/shadowbox.json](interfaces/shadowbox.json) |
| `easel.maps.worldmap@1` | client | [interfaces/worldmap.json](interfaces/worldmap.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
