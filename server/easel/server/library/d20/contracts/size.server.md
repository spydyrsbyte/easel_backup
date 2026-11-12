# easel.d20.size@1

Size categories, modifiers, weapon damage dice stepping.

## Methods

- `getSizeData(sizeKey)`
- `stepWeaponDamageDice(diceFormula, steps)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "getSizeData",
    "args": ["medium"],
    "expected": {
      "key": "medium",
      "index": 4,
      "acAttackMod": 0,
      "specialMod": 0,
      "flyMod": 0,
      "stealthMod": 0,
      "spaceFeet": 5,
      "naturalReachTallFeet": 5,
      "naturalReachLongFeet": 5
    }
  },
  {
    "method": "stepWeaponDamageDice",
    "args": ["1d8", 1],
    "expected": "2d6"
  },
  {
    "method": "stepWeaponDamageDice",
    "args": ["1d8", 2],
    "expected": "3d6"
  },
  {
    "method": "stepWeaponDamageDice",
    "args": ["1d8", -1],
    "expected": "1d6"
  },
  {
    "method": "getSizeData",
    "args": ["unknownSize"],
    "throws": true
  }
]
```
