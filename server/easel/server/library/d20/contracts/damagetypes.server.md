# easel.d20.damagetypes@1

Physical and energy damage, DR bypass, resistances, vulnerabilities.

## Methods

- `resolveDamageInstances(options)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "resolveDamageInstances",
    "args": [
      {
        "instances": [
          { "amount": 12, "types": ["slashing"] },
          { "amount": 6, "types": ["fire"] }
        ],
        "dr": [
          { "amount": 5, "bypass": ["coldIron", "good"] }
        ],
        "resistances": { "fire": 5 },
        "immunities": ["cold"],
        "vulnerabilities": []
      }
    ],
    "expected": {
      "totalLethal": 8,
      "totalNonlethal": 0,
      "totalDamage": 8,
      "breakdownPerInstance": [
        {
          "originalAmount": 12,
          "types": ["slashing"],
          "finalAmount": 7,
          "absorbedByDR": 5,
          "absorbedByHardness": 0,
          "resisted": 0,
          "isImmune": false,
          "isVulnerable": false,
          "isNonlethal": false
        },
        {
          "originalAmount": 6,
          "types": ["fire"],
          "finalAmount": 1,
          "absorbedByDR": 0,
          "absorbedByHardness": 0,
          "resisted": 5,
          "isImmune": false,
          "isVulnerable": false,
          "isNonlethal": false
        }
      ]
    }
  },
  {
    "method": "resolveDamageInstances",
    "args": [
      {
        "instances": "bad"
      }
    ],
    "throws": true
  }
]
```
