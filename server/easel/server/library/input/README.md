# easel.input

Reusable local interaction controls; these report intent and never grant server permissions.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.input.intent@1` | server | [contracts/intent.server.md](contracts/intent.server.md) |
| `easel.input.selection@1` | client | [interfaces/selection.json](interfaces/selection.json) |
| `easel.input.dragdrop@1` | client | [interfaces/dragdrop.json](interfaces/dragdrop.json) |
| `easel.input.contextmenu@1` | client | [interfaces/contextmenu.json](interfaces/contextmenu.json) |
| `easel.input.targetpicker@1` | client | [interfaces/targetpicker.json](interfaces/targetpicker.json) |
| `easel.input.shortcut@1` | client | [interfaces/shortcut.json](interfaces/shortcut.json) |
| `easel.input.popover@1` | client | [interfaces/popover.json](interfaces/popover.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
