# easel.maps.template@1

Area-of-effect template geometry (circle/burst, cone, ray/line, rectangle) and cell/token intersection queries.

## Methods

- `polygon(template)`
- `contains(template,target)`
- `cells(template,grid={})`
- `tokens(template,tokens=[])`
- `evaluate(template,scene={})`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "contains",
    "args": [
      {
        "kind": "circle",
        "origin": { "x": 100, "y": 100 },
        "radius": 50
      },
      { "x": 130, "y": 140 }
    ],
    "expected": true
  },
  {
    "method": "contains",
    "args": [
      {
        "kind": "cone",
        "origin": { "x": 0, "y": 0 },
        "length": 60,
        "direction": 0,
        "angle": 90
      },
      { "x": -10, "y": 0 }
    ],
    "expected": false
  },
  {
    "method": "tokens",
    "args": [
      {
        "kind": "ray",
        "origin": { "x": 0, "y": 0 },
        "length": 100,
        "width": 20,
        "direction": 0
      },
      [
        { "id": "t1", "x": 50, "y": 5 },
        { "id": "t2", "x": 50, "y": 40 }
      ]
    ],
    "expected": [
      { "id": "t1", "x": 50, "y": 5 }
    ]
  },
  {
    "method": "contains",
    "args": [
      {
        "kind": "circle",
        "origin": { "x": 0, "y": 0 },
        "radius": -5
      },
      { "x": 0, "y": 0 }
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
