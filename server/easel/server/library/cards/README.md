# easel.cards

Independent card and collection presentations plus reusable card manipulations; no prescribed card-game rules.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.cards.card@1` | server | [contracts/card.server.md](contracts/card.server.md) |
| `easel.cards.deck@1` | server | [contracts/deck.server.md](contracts/deck.server.md) |
| `easel.cards.hand@1` | server | [contracts/hand.server.md](contracts/hand.server.md) |
| `easel.cards.shuffle@1` | server | [contracts/shuffle.server.md](contracts/shuffle.server.md) |
| `easel.cards.card@1` | client | [interfaces/card.json](interfaces/card.json) |
| `easel.cards.hand@1` | client | [interfaces/hand.json](interfaces/hand.json) |
| `easel.cards.pile@1` | client | [interfaces/pile.json](interfaces/pile.json) |
| `easel.cards.deck@1` | client | [interfaces/deck.json](interfaces/deck.json) |
| `easel.cards.inspector@1` | client | [interfaces/inspector.json](interfaces/inspector.json) |
| `easel.cards.fan@1` | client | [interfaces/fan.json](interfaces/fan.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
