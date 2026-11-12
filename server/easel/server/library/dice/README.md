# easel.dice

Dice generation, representation and outcome interpretation utilities.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.dice.roller@1` | server | [contracts/roller.server.md](contracts/roller.server.md) |
| `easel.dice.pool@1` | server | [contracts/pool.server.md](contracts/pool.server.md) |
| `easel.dice.notation@1` | server | [contracts/notation.server.md](contracts/notation.server.md) |
| `easel.dice.results@1` | server | [contracts/results.server.md](contracts/results.server.md) |
| `easel.dice.die@1` | client | [interfaces/die.json](interfaces/die.json) |
| `easel.dice.tray@1` | client | [interfaces/tray.json](interfaces/tray.json) |
| `easel.dice.results@1` | client | [interfaces/results.json](interfaces/results.json) |
| `easel.dice.poolbuilder@1` | client | [interfaces/poolbuilder.json](interfaces/poolbuilder.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
