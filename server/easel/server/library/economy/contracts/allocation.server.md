# easel.economy.allocation@1

Compute distribution for a completed bidding or sale round.

## Methods

- `distribute(bids,quantity,{price="bid",reserve=0}={})`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "distribute",
    "args": [
      [
        {
          "actor": "a",
          "amount": 3
        },
        {
          "actor": "b",
          "amount": 5
        }
      ],
      1
    ],
    "expected": [
      {
        "actor": "b",
        "amount": 5,
        "price": 5
      }
    ]
  },
  {
    "method": "distribute",
    "args": [
      [],
      -1
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
