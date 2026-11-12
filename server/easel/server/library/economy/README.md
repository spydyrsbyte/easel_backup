# easel.economy

Prices, offers and bids as reusable independent primitives, not a marketplace subsystem.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.economy.quote@1` | server | [contracts/quote.server.md](contracts/quote.server.md) |
| `easel.economy.offer@1` | server | [contracts/offer.server.md](contracts/offer.server.md) |
| `easel.economy.bid@1` | server | [contracts/bid.server.md](contracts/bid.server.md) |
| `easel.economy.allocation@1` | server | [contracts/allocation.server.md](contracts/allocation.server.md) |
| `easel.economy.market@1` | client | [interfaces/market.json](interfaces/market.json) |
| `easel.economy.offer@1` | client | [interfaces/offer.json](interfaces/offer.json) |
| `easel.economy.auction@1` | client | [interfaces/auction.json](interfaces/auction.json) |
| `easel.economy.price@1` | client | [interfaces/price.json](interfaces/price.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
