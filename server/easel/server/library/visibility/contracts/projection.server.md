# easel.visibility.projection@1

Build or assist in building an actor-specific safe representation from authoritative game state, including viewer-specific battlemap fog/presentation projection and map sanitization.

## Methods

- `fields(value,names)`
- `project(value,viewer,{public:publicFields=[],private:privateFields=[],ownerField="owner"}={})`
- `collection(values,viewer,options)`
- `sanitizeMap(map)`
- `projectBattlemap(map,viewer,options={})`
- `invalidate(viewer,options={})`
- `diffProjection(previous,next)`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "project",
    "args": [
      {
        "id": "a",
        "owner": "alice",
        "secret": "hidden"
      },
      "bob",
      {
        "public": [
          "id"
        ],
        "private": [
          "secret"
        ]
      }
    ],
    "expected": {
      "id": "a"
    }
  },
  {
    "method": "project",
    "args": [
      {
        "id": "a",
        "owner": "alice",
        "secret": "hidden"
      },
      "alice",
      {
        "public": [
          "id"
        ],
        "private": [
          "secret"
        ]
      }
    ],
    "expected": {
      "id": "a",
      "secret": "hidden"
    }
  },
  {
    "method": "sanitizeMap",
    "args": [
      {
        "id": "m1",
        "visionMask": { "width": 2, "height": 2, "rgba": "AAAA" },
        "tokens": [
          { "id": "t1", "x": 10, "y": 10, "presentation": { "opacity": 0.5 } }
        ]
      }
    ],
    "expected": {
      "id": "m1",
      "tokens": [
        { "id": "t1", "x": 10, "y": 10 }
      ]
    }
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
