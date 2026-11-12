# easel.resources.charges@1

Track bounded charge/use pools, per-use deduction and period-based restoration.

## Methods

- `spend(pool,cost=1)`
- `restore(pool,{period,amount=null}={})`
- `evaluateMax(pool,maxValue)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "spend",
    "args": [
      {
        "value": 3,
        "max": 5,
        "per": "day"
      },
      2
    ],
    "expected": {
      "value": 1,
      "max": 5,
      "per": "day"
    }
  },
  {
    "method": "restore",
    "args": [
      {
        "value": 1,
        "max": 5,
        "per": "day"
      },
      {
        "period": "day"
      }
    ],
    "expected": {
      "value": 5,
      "max": 5,
      "per": "day"
    }
  },
  {
    "method": "evaluateMax",
    "args": [
      {
        "value": 6,
        "max": 6,
        "per": "day"
      },
      4
    ],
    "expected": {
      "value": 4,
      "max": 4,
      "per": "day"
    }
  },
  {
    "method": "spend",
    "args": [
      {
        "value": 1,
        "max": 3,
        "per": "day"
      },
      2
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
