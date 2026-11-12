# easel.characters.derived@1

Compute derived values from explicitly supplied inputs/dependency rules.

## Methods

- `evaluate(inputs,definitions)`
- `evaluateWithBreakdown(inputs,definitions,modifiers={})`

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
        "a": 2,
        "b": 3
      },
      [
        {
          "id": "c",
          "inputs": [
            "a",
            "b"
          ],
          "op": "sum"
        }
      ]
    ],
    "expected": {
      "a": 2,
      "b": 3,
      "c": 5
    }
  },
  {
    "method": "evaluate",
    "args": [
      {},
      [
        {
          "id": "c",
          "inputs": [
            "c"
          ],
          "op": "sum"
        }
      ]
    ],
    "throws": true
  },
  {
    "method": "evaluateWithBreakdown",
    "args": [
      {
        "score": 15
      },
      [
        {
          "id": "shifted",
          "inputs": [
            "score"
          ],
          "op": "sum",
          "offset": -10
        },
        {
          "id": "mod",
          "inputs": [
            "shifted"
          ],
          "op": "floor",
          "factor": 0.5
        }
      ],
      {
        "mod": [
          {
            "id": "buff",
            "op": "add",
            "value": 1
          }
        ]
      }
    ],
    "expected": {
      "values": {
        "score": 15,
        "shifted": 5,
        "mod": 3
      },
      "breakdowns": {
        "shifted": {
          "base": 5,
          "value": 5,
          "applied": []
        },
        "mod": {
          "base": 2,
          "value": 3,
          "applied": [
            {
              "id": "buff",
              "before": 2,
              "after": 3
            }
          ]
        }
      }
    }
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
