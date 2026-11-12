# easel.progression.allocation@1

Compute purchasable distributions under caps and prerequisites.

## Methods

- `evaluate(values,rules,budget)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "evaluate",
    "args": [
      {
        "str": 3
      },
      {
        "str": {
          "min": 1,
          "max": 5,
          "cost": 2
        }
      },
      5
    ],
    "expected": {
      "values": {
        "str": 3
      },
      "cost": 4,
      "remaining": 1,
      "affordable": true
    }
  },
  {
    "method": "evaluate",
    "args": [
      {
        "str": 9
      },
      {
        "str": {
          "max": 5
        }
      },
      10
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
