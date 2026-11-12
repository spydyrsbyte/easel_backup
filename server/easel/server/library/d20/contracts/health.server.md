# easel.d20.health@1

HP state transitions, nonlethal damage, death thresholds.

## Methods

- `resolveHealthState(options)`
- `applyDamageToPools(options)`
- `calculateHitDice(options)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "resolveHealthState",
    "args": [
      {
        "hp": 25,
        "maxHp": 30,
        "tempHp": 5,
        "nonlethal": 0,
        "deathThreshold": -14
      }
    ],
    "expected": {
      "hp": 25,
      "maxHp": 30,
      "tempHp": 5,
      "nonlethal": 0,
      "effectiveHp": 30,
      "status": "healthy"
    }
  },
  {
    "method": "resolveHealthState",
    "args": [
      {
        "hp": -15,
        "maxHp": 30,
        "deathThreshold": -14
      }
    ],
    "expected": {
      "hp": -15,
      "maxHp": 30,
      "tempHp": 0,
      "nonlethal": 0,
      "effectiveHp": -15,
      "status": "dead"
    }
  },
  {
    "method": "applyDamageToPools",
    "args": [
      {
        "hp": 20,
        "maxHp": 20,
        "tempHp": 5,
        "nonlethal": 0,
        "lethalDamage": 8
      }
    ],
    "expected": {
      "hp": 17,
      "maxHp": 20,
      "tempHp": 0,
      "nonlethal": 0
    }
  },
  {
    "method": "resolveHealthState",
    "args": [
      {
        "hp": "bad"
      }
    ],
    "throws": true
  }
]
```
