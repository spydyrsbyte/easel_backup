# easel.characters

Character presentation and stat-related utilities; no prescribed GURPS/BitD schema.

This Kit is a catalog of independent tools. Its manifest has no library, application or security entry and declares no records. Server files load through interface creation; browser files load through `await Easel.Interfaces.load(name)` or a consumer's declared interface requirement. Implementations are cached while instances remain independent.

| Member | Side | Contract |
|---|---|---|
| `easel.characters.attributes@1` | server | [contracts/attributes.server.md](contracts/attributes.server.md) |
| `easel.characters.skills@1` | server | [contracts/skills.server.md](contracts/skills.server.md) |
| `easel.characters.traits@1` | server | [contracts/traits.server.md](contracts/traits.server.md) |
| `easel.characters.derived@1` | server | [contracts/derived.server.md](contracts/derived.server.md) |
| `easel.characters.sheet@1` | client | [interfaces/sheet.json](interfaces/sheet.json) |
| `easel.characters.attribute@1` | client | [interfaces/attribute.json](interfaces/attribute.json) |
| `easel.characters.skilllist@1` | client | [interfaces/skilllist.json](interfaces/skilllist.json) |
| `easel.characters.traitlist@1` | client | [interfaces/traitlist.json](interfaces/traitlist.json) |
| `easel.characters.playbook@1` | client | [interfaces/playbook.json](interfaces/playbook.json) |

Browser properties have defaults in each JSON contract. Components receive already-projected data and emit local intents only. They never call game events, access records, or grant permissions. Destroying a component releases its listeners, observers and timers.
