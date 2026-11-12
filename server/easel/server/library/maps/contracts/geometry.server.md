# easel.maps.geometry@1

Line-of-sight, range, area, path, collision, grid, and multi-ground hierarchy geometry calculations.

## Methods

- `distance(a,b)`
- `lineOfSight(a,b,walls=[])`
- `contains(value,polygon)`
- `insidePolygon(value,polygon)`
- `area(polygon)`
- `bodyRadius(size)`
- `movementBlocked(walls,from,to,size)`
- `createGrid(raw={})`
- `createGround(raw={},index=0)`
- `createLayer(raw={},index=0)`
- `layerFeatures(type)`
- `emptyBattleMap(overrides={})`
- `grounds(map)`
- `activeGround(map,groundId)`
- `mapSize(map)`
- `unitsPerPixel(map)`
- `findLayer(layers,id)`
- `findItem(ground,itemId,filterFn)`
- `itemKind(item)`
- `targetLayer(ground,itemOrType)`
- `moveLayer(siblings,id,delta)`
- `groundStack(map,groundId)`
- `visibleStack(map,groundId,tokens=null)`
- `battleView(map,groundId,options={})`
- `plainStack(options={})`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "lineOfSight",
    "args": [
      {
        "x": 0,
        "y": 0
      },
      {
        "x": 2,
        "y": 0
      },
      [
        {
          "a": {
            "x": 1,
            "y": -1
          },
          "b": {
            "x": 1,
            "y": 1
          }
        }
      ]
    ],
    "expected": false
  },
  {
    "method": "area",
    "args": [
      [
        {
          "x": 0,
          "y": 0
        },
        {
          "x": 2,
          "y": 0
        },
        {
          "x": 0,
          "y": 2
        }
      ]
    ],
    "expected": 2
  },
  {
    "method": "bodyRadius",
    "args": [
      {
        "w": 64,
        "h": 64
      }
    ],
    "expected": 25.6
  },
  {
    "method": "movementBlocked",
    "args": [
      [
        {
          "id": "w1",
          "kind": "wall",
          "x1": 100,
          "y1": 0,
          "x2": 100,
          "y2": 200
        }
      ],
      {
        "x": 50,
        "y": 100
      },
      {
        "x": 150,
        "y": 100
      },
      {
        "w": 64,
        "h": 64
      }
    ],
    "expected": true
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.
