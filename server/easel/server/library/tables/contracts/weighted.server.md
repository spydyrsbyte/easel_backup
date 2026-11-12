# easel.tables.weighted@1

Choose weighted entries using approved server randomness.

## Methods

- `choose(entries,source)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: Easel.Random. Random sources supply `integer(min, max)` with an inclusive minimum and exclusive maximum. Omitting the source uses the trusted cryptographic Go service `Easel.Random`.

## Examples and failures

```json
[
  {
    "method": "choose",
    "args": [
      []
    ],
    "throws": true
  },
  {
    "method": "choose",
    "args": [
      [
        {
          "weight": 0,
          "value": "a"
        }
      ]
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
