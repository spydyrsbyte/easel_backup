# easel.surfaces

Generic tabletop surfaces, coordinate systems and camera controls; separate from the existing Chess/Checkers board package.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.surfaces.geometry@1` | server | [contracts/geometry.server.md](contracts/geometry.server.md) |
| `easel.surfaces.position@1` | server | [contracts/position.server.md](contracts/position.server.md) |
| `easel.surfaces.distance@1` | server | [contracts/distance.server.md](contracts/distance.server.md) |
| `easel.surfaces.table@1` | client | [interfaces/table.json](interfaces/table.json) |
| `easel.surfaces.squaregrid@1` | client | [interfaces/squaregrid.json](interfaces/squaregrid.json) |
| `easel.surfaces.hexgrid@1` | client | [interfaces/hexgrid.json](interfaces/hexgrid.json) |
| `easel.surfaces.camera@1` | client | [interfaces/camera.json](interfaces/camera.json) |
| `easel.surfaces.placement@1` | client | [interfaces/placement.json](interfaces/placement.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
