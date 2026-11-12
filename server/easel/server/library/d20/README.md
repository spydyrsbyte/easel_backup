# easel.d20.d20

Reusable server calculation bricks and client UI widgets for d20-family tabletop RPGs.

## Server Interfaces

| Interface | Role | Contract |
|---|---|---|
| `easel.d20.abilities@1` | Six classic ability scores, modifiers, damage, drain, and point buy | [contracts/abilities.server.md](contracts/abilities.server.md) |
| `easel.d20.check@1` | d20 checks, advantage/disadvantage, natural 1/20, attacks and criticals | [contracts/check.server.md](contracts/check.server.md) |
| `easel.d20.defense@1` | Normal, Touch, and Flat-Footed Armor Class, saving throws | [contracts/defense.server.md](contracts/defense.server.md) |
| `easel.d20.health@1` | HP state transitions, nonlethal damage, death thresholds | [contracts/health.server.md](contracts/health.server.md) |
| `easel.d20.spellbook@1` | Bonus spell slots, spell DC, concentration and caster level checks | [contracts/spellbook.server.md](contracts/spellbook.server.md) |
| `easel.d20.size@1` | Size categories, modifiers, weapon damage dice stepping | [contracts/size.server.md](contracts/size.server.md) |
| `easel.d20.damagetypes@1` | Physical and energy damage, DR bypass, resistances, vulnerabilities | [contracts/damagetypes.server.md](contracts/damagetypes.server.md) |
| `easel.d20.grid@1` | 5-10-5 alternating diagonal distance, threatened squares, templates | [contracts/grid.server.md](contracts/grid.server.md) |
| `easel.d20.currency@1` | Multi-denomination coinage conversion, weight, and change-making | [contracts/currency.server.md](contracts/currency.server.md) |

## Client Component Interfaces

| Component | Role | Interface |
|---|---|---|
| `easel.d20.abilityblock@1` | Six-ability scores strip, totals, modifiers, roll triggers | [interfaces/abilityblock.json](interfaces/abilityblock.json) |
| `easel.d20.defensebanner@1` | AC and Saving Throws banner | [interfaces/defensebanner.json](interfaces/defensebanner.json) |
| `easel.d20.vitality@1` | HP bar, temp HP, nonlethal damage, damage/heal actions | [interfaces/vitality.json](interfaces/vitality.json) |
| `easel.d20.spellbook@1` | Spell level tabs, prepared slots, cast buttons | [interfaces/spellbook.json](interfaces/spellbook.json) |
| `easel.d20.attackcard@1` | Attack chat card, criticals, damage types, apply damage | [interfaces/attackcard.json](interfaces/attackcard.json) |
| `easel.d20.rolldialog@1` | Roll modifiers prompt modal | [interfaces/rolldialog.json](interfaces/rolldialog.json) |
| `easel.d20.equipmentslots@1` | Magic item body slot equipment list / paper doll | [interfaces/equipmentslots.json](interfaces/equipmentslots.json) |
