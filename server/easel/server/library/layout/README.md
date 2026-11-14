# easel.layout

Containers and application layout widgets; rendering only unless the consumer elects to save layout preferences.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.layout.workspace@1` | server | [contracts/workspace.server.md](contracts/workspace.server.md) |
| `easel.layout.panel@1` | client | [interfaces/panel.json](interfaces/panel.json) |
| `easel.layout.tabs@1` | client | [interfaces/tabs.json](interfaces/tabs.json) |
| `easel.layout.dialog@1` | client | [interfaces/dialog.json](interfaces/dialog.json) |
| `easel.layout.split@1` | client | [interfaces/split.json](interfaces/split.json) |
| `easel.layout.sheet@1` | client | [interfaces/sheet.json](interfaces/sheet.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
