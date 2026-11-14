# easel.combat

Generic tactical/combat calculations and UI, not a required model of combat for all RPGs.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.combat.initiative@1` | server | [contracts/initiative.server.md](contracts/initiative.server.md) |
| `easel.combat.attack@1` | server | [contracts/attack.server.md](contracts/attack.server.md) |
| `easel.combat.damage@1` | server | [contracts/damage.server.md](contracts/damage.server.md) |
| `easel.combat.range@1` | server | [contracts/range.server.md](contracts/range.server.md) |
| `easel.combat.initiative@1` | client | [interfaces/initiative.json](interfaces/initiative.json) |
| `easel.combat.target@1` | client | [interfaces/target.json](interfaces/target.json) |
| `easel.combat.damage@1` | client | [interfaces/damage.json](interfaces/damage.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
