# easel.effects.stacking@1

Combine/reject overlapping effects according to selected policy.

## Methods

- `combine(effects,incoming,policy="replace")`
- `resolve(effects,policies={},defaultPolicy="strongest")`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "combine",
    "args": [
      [
        {
          "key": "a",
          "value": 2
        }
      ],
      {
        "key": "a",
        "value": 1
      },
      "strongest"
    ],
    "expected": [
      {
        "key": "a",
        "value": 2
      }
    ]
  },
  {
    "method": "combine",
    "args": [
      [
        {
          "key": "a"
        }
      ],
      {
        "key": "a"
      },
      "reject"
    ],
    "throws": true
  },
  {
    "method": "resolve",
    "args": [
      [
        {
          "id": "e1",
          "key": "typed",
          "value": 2
        },
        {
          "id": "e2",
          "key": "typed",
          "value": 4
        },
        {
          "id": "e3",
          "key": "typed",
          "value": -1
        },
        {
          "id": "e4",
          "key": "untyped",
          "value": 1
        },
        {
          "id": "e5",
          "key": "untyped",
          "value": 2
        }
      ],
      {
        "typed": "bonusStrongestPenaltyStack",
        "untyped": "stack"
      }
    ],
    "expected": {
      "total": 6,
      "active": [
        {
          "id": "e2",
          "key": "typed",
          "value": 4
        },
        {
          "id": "e3",
          "key": "typed",
          "value": -1
        },
        {
          "id": "e4",
          "key": "untyped",
          "value": 1
        },
        {
          "id": "e5",
          "key": "untyped",
          "value": 2
        }
      ],
      "suppressed": [
        {
          "id": "e1",
          "key": "typed",
          "value": 2
        }
      ]
    }
  },
  {
    "method": "resolve",
    "args": [
      [],
      {
        "a": "unknown"
      }
    ],
    "throws": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
