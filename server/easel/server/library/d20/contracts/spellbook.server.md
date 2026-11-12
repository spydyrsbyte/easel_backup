# easel.d20.spellbook@1

Bonus spell slots, spell DC, concentration and caster level checks.

## Methods

- `bonusSlotsForAbility(abilityModifier, maxSpellLevel)`
- `resolveSpellDC(options)`
- `rollConcentration(options, checkService)`
- `rollCasterLevelCheck(options, checkService)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "bonusSlotsForAbility",
    "args": [4, 9],
    "expected": [0, 1, 1, 1, 1, 0, 0, 0, 0, 0]
  },
  {
    "method": "resolveSpellDC",
    "args": [
      {
        "base": 10,
        "spellLevel": 3,
        "abilityModifier": 4,
        "modifiers": [
          { "name": "Spell Focus", "value": 1 }
        ]
      }
    ],
    "expected": {
      "total": 18,
      "dc": 18,
      "breakdown": {
        "base": 10,
        "spellLevel": 3,
        "abilityModifier": 4,
        "stackedBonus": 1,
        "modifiers": [
          { "name": "Spell Focus", "value": 1 }
        ]
      }
    }
  },
  {
    "method": "bonusSlotsForAbility",
    "args": ["invalid"],
    "throws": true
  }
]
```
