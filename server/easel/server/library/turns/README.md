# easel.turns

Turn ordering, phases, round and priority primitives; individual games decide when advancement is legal.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.turns.sequence@1` | server | [contracts/sequence.server.md](contracts/sequence.server.md) |
| `easel.turns.phase@1` | server | [contracts/phase.server.md](contracts/phase.server.md) |
| `easel.turns.priority@1` | server | [contracts/priority.server.md](contracts/priority.server.md) |
| `easel.turns.simultaneous@1` | server | [contracts/simultaneous.server.md](contracts/simultaneous.server.md) |
| `easel.turns.turnorder@1` | client | [interfaces/turnorder.json](interfaces/turnorder.json) |
| `easel.turns.phase@1` | client | [interfaces/phase.json](interfaces/phase.json) |
| `easel.turns.priority@1` | client | [interfaces/priority.json](interfaces/priority.json) |
| `easel.turns.ready@1` | client | [interfaces/ready.json](interfaces/ready.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
