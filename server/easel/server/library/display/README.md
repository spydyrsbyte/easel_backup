# easel.display

Small visual components that remain useful in any game genre.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.display.image@1` | client | [interfaces/image.json](interfaces/image.json) |
| `easel.display.label@1` | client | [interfaces/label.json](interfaces/label.json) |
| `easel.display.badge@1` | client | [interfaces/badge.json](interfaces/badge.json) |
| `easel.display.tooltip@1` | client | [interfaces/tooltip.json](interfaces/tooltip.json) |
| `easel.display.notification@1` | client | [interfaces/notification.json](interfaces/notification.json) |
| `easel.display.portrait@1` | client | [interfaces/portrait.json](interfaces/portrait.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
