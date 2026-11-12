# easel.d20.grid@1

5-10-5 alternating diagonal distance, threatened squares, templates.

## Methods

- `measureDistance5105(points, feetPerSquare)`
- `getThreatenedSquares(options)`
- `rasterizeTemplate(options)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "measureDistance5105",
    "args": [
      [
        { "x": 0, "y": 0 },
        { "x": 1, "y": 1 }
      ],
      5
    ],
    "expected": {
      "feet": 5,
      "totalSquares": 1,
      "diagonals": 1,
      "straights": 0
    }
  },
  {
    "method": "measureDistance5105",
    "args": [
      [
        { "x": 0, "y": 0 },
        { "x": 2, "y": 2 }
      ],
      5
    ],
    "expected": {
      "feet": 15,
      "totalSquares": 3,
      "diagonals": 2,
      "straights": 0
    }
  },
  {
    "method": "measureDistance5105",
    "args": [
      [
        { "x": 0, "y": 0 },
        { "x": 4, "y": 4 }
      ],
      5
    ],
    "expected": {
      "feet": 30,
      "totalSquares": 6,
      "diagonals": 4,
      "straights": 0
    }
  },
  {
    "method": "measureDistance5105",
    "args": ["invalid"],
    "throws": true
  }
]
```
