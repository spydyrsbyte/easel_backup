# easel.d20.defense@1

Normal, Touch, and Flat-Footed Armor Class, saving throws.

## Methods

- `resolveArmorClass(options)`
- `resolveSavingThrows(options)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "resolveArmorClass",
    "args": [
      {
        "base": 10,
        "modifiers": [
          { "type": "armor", "value": 4 },
          { "type": "dex", "value": 2 },
          { "type": "dodge", "value": 1 }
        ]
      }
    ],
    "expected": {
      "normal": 17,
      "touch": 13,
      "flatFooted": 14,
      "breakdowns": {
        "normal": {
          "total": 7,
          "active": [
            { "type": "dodge", "value": 1 },
            { "type": "armor", "value": 4 },
            { "type": "dex", "value": 2 }
          ],
          "suppressed": []
        },
        "touch": {
          "total": 3,
          "active": [
            { "type": "dodge", "value": 1 },
            { "type": "dex", "value": 2 }
          ],
          "suppressed": []
        },
        "flatFooted": {
          "total": 4,
          "active": [
            { "type": "armor", "value": 4 }
          ],
          "suppressed": []
        }
      }
    }
  },
  {
    "method": "resolveArmorClass",
    "args": [
      {
        "base": "invalid"
      }
    ],
    "throws": true
  }
]
```
