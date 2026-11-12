# easel.dice.pool@1

Describe and evaluate collections of heterogeneous dice, including reroll/keep/drop.

## Methods

- `evaluate(rolls,{drop=0,keep=rolls.length-drop,highest=true}={})`
- `describe(groups)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "evaluate",
    "args": [
      [
        1,
        6,
        3
      ],
      {
        "keep": 2
      }
    ],
    "expected": {
      "total": 9,
      "kept": [
        1,
        2
      ],
      "dropped": [
        0
      ]
    }
  },
  {
    "method": "describe",
    "args": [
      [
        {
          "sides": 1,
          "count": 1
        }
      ]
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
