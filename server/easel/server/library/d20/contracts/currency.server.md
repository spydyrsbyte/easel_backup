# easel.d20.currency@1

Multi-denomination coinage conversion, weight, and change-making.

## Methods

- `toCopper(coins)`
- `fromCopper(copper)`
- `coinWeightLbs(coins, coinsPerLb)`
- `deductCurrency(wallet, cost, allowHigherDenominationChange)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "toCopper",
    "args": [
      { "pp": 1, "gp": 2, "sp": 3, "cp": 4 }
    ],
    "expected": 1234
  },
  {
    "method": "fromCopper",
    "args": [1234],
    "expected": { "pp": 1, "gp": 2, "sp": 3, "cp": 4 }
  },
  {
    "method": "coinWeightLbs",
    "args": [
      { "pp": 0, "gp": 50, "sp": 0, "cp": 0 },
      50
    ],
    "expected": 1
  },
  {
    "method": "deductCurrency",
    "args": [
      { "pp": 0, "gp": 10, "sp": 0, "cp": 0 },
      { "pp": 0, "gp": 3, "sp": 5, "cp": 0 },
      true
    ],
    "expected": {
      "ok": true,
      "newWallet": { "pp": 0, "gp": 6, "sp": 5, "cp": 0 },
      "changeGiven": true
    }
  },
  {
    "method": "toCopper",
    "args": ["invalid"],
    "throws": true
  }
]
```
