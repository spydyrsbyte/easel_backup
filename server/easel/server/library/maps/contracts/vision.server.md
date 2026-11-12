# easel.maps.vision@1

Compute visible areas, hindrance attenuation, luminance-gated detail, and sampled vision masks from supplied obstructions and observers.

## Methods

- `visible(observer,targets,{range=10,walls=[],facing=0,fov=360}={})`
- `polygon(observer,{range=10,walls=[],facing=0,fov=360,rays=128}={})`
- `register({hindrances=[],presets={},builtin,reset=false}={})`
- `catalog()`
- `has(name)`
- `types(value=[])`
- `vision(value)`
- `visibility(value=true)`
- `presentation(value={})`
- `angleMatches(angle,range)`
- `inFieldOfView(token,at)`
- `hindrance(vision,visibility,angle=0,typesOverride)`
- `combineHindrances(values=[])`
- `effectiveDistance(distance,crossings=[])`
- `detailAt(vision,distance,observerLuminance=1)`
- `createVisionField(scene,options={})`
- `evaluateScene(scene,options={})`

## Contract

Inputs and outputs are JSON-compatible values. Collection methods preserve input order unless explicitly reordering. Identifiers are nonempty strings. Numeric inputs must be finite, counts must be integers, and out-of-range values, unsupported policies, unknown targets and duplicate exclusive memberships throw descriptive TypeError, RangeError or Error exceptions. Inputs are never mutated; update, debit, move and similar methods return proposed replacement values. Validation methods return normalized values or throw. Queries return null when their documented example has no match. This member does not authenticate a caller, read or save game records, run automations, schedule events or emit network messages. The consuming application authorizes its operation and commits returned changes in its existing transaction. Transfer results must be committed together. Runtime instances hold no game state.

Dependencies: local validation/value helpers only. No other member implementation is loaded.

## Examples and failures

```json
[
  {
    "method": "visible",
    "args": [
      {
        "x": 0,
        "y": 0
      },
      [
        {
          "id": "a",
          "x": 2,
          "y": 0
        },
        {
          "id": "b",
          "x": 12,
          "y": 0
        }
      ],
      {
        "range": 3
      }
    ],
    "expected": [
      {
        "id": "a",
        "x": 2,
        "y": 0
      }
    ]
  },
  {
    "method": "visible",
    "args": [
      {
        "x": 0,
        "y": 0
      },
      [],
      {
        "range": -1
      }
    ],
    "throws": true
  },
  {
    "method": "combineHindrances",
    "args": [
      [0.5, 0.5]
    ],
    "expected": 0.75
  },
  {
    "method": "effectiveDistance",
    "args": [
      30,
      [
        { "distance": 10, "hindrance": 0.5 },
        { "distance": 20, "hindrance": 0.5 }
      ]
    ],
    "expected": 70
  }
]
```

`throws: true` denotes rejected input. Other examples give the exact returned value.

`polygon` returns a ray-cast visibility polygon. It samples the range boundary and casts additional rays on both sides of every closed wall endpoint. For a restricted FOV it includes the observer at the start/end. Range is nonnegative, FOV is (0,360], rays are bounded to 4-2048, and opened walls are ignored.
