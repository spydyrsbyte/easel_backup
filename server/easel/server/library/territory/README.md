# easel.territory

Area ownership, influence and control representations, useful beyond wargames.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.territory.influence@1` | server | [contracts/influence.server.md](contracts/influence.server.md) |
| `easel.territory.control@1` | server | [contracts/control.server.md](contracts/control.server.md) |
| `easel.territory.controlmap@1` | client | [interfaces/controlmap.json](interfaces/controlmap.json) |
| `easel.territory.influence@1` | client | [interfaces/influence.json](interfaces/influence.json) |
| `easel.territory.regionmarker@1` | client | [interfaces/regionmarker.json](interfaces/regionmarker.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
