# easel.workflow

Presentation and state helpers for multi-step decisions; the game/module supplies the actual process.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.workflow.steps@1` | server | [contracts/steps.server.md](contracts/steps.server.md) |
| `easel.workflow.responses@1` | server | [contracts/responses.server.md](contracts/responses.server.md) |
| `easel.workflow.timeout@1` | server | [contracts/timeout.server.md](contracts/timeout.server.md) |
| `easel.workflow.wizard@1` | client | [interfaces/wizard.json](interfaces/wizard.json) |
| `easel.workflow.prompt@1` | client | [interfaces/prompt.json](interfaces/prompt.json) |
| `easel.workflow.waiting@1` | client | [interfaces/waiting.json](interfaces/waiting.json) |
| `easel.workflow.review@1` | client | [interfaces/review.json](interfaces/review.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
