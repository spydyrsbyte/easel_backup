# easel.zones.zone@1

Describe region capacity, labels and acceptable member categories without defining game-specific legality.

## Methods

- `validate(zone)`
- `accepts(zone,member,members=[])`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "accepts",
    "args": [
      {
        "id": "a",
        "capacity": 1,
        "accepts": [
          "card"
        ]
      },
      {
        "kind": "card"
      },
      []
    ],
    "expected": true
  },
  {
    "method": "accepts",
    "args": [
      {
        "id": "a",
        "capacity": 0
      },
      {
        "kind": "card"
      },
      []
    ],
    "expected": false
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
