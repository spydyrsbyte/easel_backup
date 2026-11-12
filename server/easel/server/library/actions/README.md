# easel.actions

Candidate actions and decision presentation; no universal game action executor.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.actions.availability@1` | server | [contracts/availability.server.md](contracts/availability.server.md) |
| `easel.actions.choice@1` | server | [contracts/choice.server.md](contracts/choice.server.md) |
| `easel.actions.targeting@1` | server | [contracts/targeting.server.md](contracts/targeting.server.md) |
| `easel.actions.menu@1` | client | [interfaces/menu.json](interfaces/menu.json) |
| `easel.actions.chooser@1` | client | [interfaces/chooser.json](interfaces/chooser.json) |
| `easel.actions.targetselector@1` | client | [interfaces/targetselector.json](interfaces/targetselector.json) |
| `easel.actions.actionbar@1` | client | [interfaces/actionbar.json](interfaces/actionbar.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
