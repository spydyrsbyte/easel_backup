# easel.combat.range@1

Compute attack distances, arcs and cover from supplied geometry.

## Methods

- `evaluate(origin,target,{min=0,max=10,facing=0,arc=360,walls=[]}={})`

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
        "x": 0,
        "y": 0
      },
      {
        "x": 3,
        "y": 4
      }
    ],
    "expected": {
      "distance": 5,
      "inRange": true,
      "inArc": true,
      "cover": false
    }
  },
  {
    "method": "evaluate",
    "args": [
      {
        "x": 0,
        "y": 0
      },
      {
        "x": 0,
        "y": 0
      },
      {
        "max": -1
      }
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
