# easel.surfaces.position@1

Query/update supported object positions using a consumer-chosen persistence model.

## Methods

- `get(values,id)`
- `update(values,id,position,allowed)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "get",
    "args": [
      [
        {
          "id": "a",
          "x": 1,
          "y": 2
        }
      ],
      "a"
    ],
    "expected": {
      "x": 1,
      "y": 2,
      "rotation": 0
    }
  },
  {
    "method": "update",
    "args": [
      [
        {
          "id": "a",
          "x": 1,
          "y": 2
        }
      ],
      "a",
      {
        "x": 0,
        "y": 0
      },
      []
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
