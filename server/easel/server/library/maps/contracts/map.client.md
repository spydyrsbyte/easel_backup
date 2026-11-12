# easel.maps.map@1

PixiJS v8 multi-level battlemap viewport with camera, grid calibration, tokens, walls/doors/columns, lighting/fog, overhead roofs, AoE templates, and `.map` archive import/export.

## Properties

| Property | Type | Default | Meaning |
|---|---|---|---|
| `title` | String | `""` | Optional heading for this view. |
| `disabled` | Boolean | `false` | Disables locally emitted interaction intents. |
| `open` | Boolean | `true` | Controls whether the component is visible. |
| `data` | Object | `{}` | Caller-projected battlemap record. |
| `camera` | Object | `{"x":0,"y":0,"zoom":1,"rotation":0}` | Local camera values x/y (screen pixels), zoom (positive scale), and rotation (degrees). |
| `width` | Number | `1000` | Presentation width in pixels. |
| `height` | Number | `700` | Presentation height in pixels. |
| `focus` | Object | `{}` | World point {x,y} to focus when changed. |
| `layers` | Array | `[]` | Ordered projected image layers with image, x/y, width/height, opacity and hidden. |
| `tokens` | Array | `[]` | Projected visible tokens on the active ground. |
| `walls` | Array | `[]` | Wall segments, doors, and circular columns. |
| `lights` | Array | `[]` | Point light sources on the active ground. |
| `drawings` | Array | `[]` | Polygon/freehand map annotations. |
| `roofs` | Array | `[]` | Overhead roof polygons with automatic token-underneath occlusion hiding. |
| `templates` | Array | `[]` | Active AoE templates rendered over the battlemap. |
| `grounds` | Array | `[]` | Multi-elevation ground levels sorted by elevation. |
| `activeGroundId` | String | `""` | Currently viewed ground level ID. |
| `grid` | Object | `{"offsetX":0,"offsetY":0,"cellSize":64,"scale":5,"unit":"ft","snap":true,"visible":true,"color":16777215,"alpha":0.18,"calibrated":false}` | Grid configuration. |
| `visionMask` | Object | `{}` | Server-projected sampled RGBA vision mask `{width,height,rgba}`. |
| `fog` | Boolean | `false` | Whether fog of war is active. |
| `ambientLight` | String | `"NORMAL"` | Ambient illumination (`DARK`, `DIM`, `NORMAL`, `BRIGHT`). |
| `gm` | Boolean | `false` | Enables GM presentation and wall/door controls. |
| `tool` | String | `"select"` | Active interaction tool (`select`, `calibrate`, `wall`, `door`, `light`). |
| `selectedTokenId` | String | `""` | Currently selected token ID. |

## Local events

- `close {}` requests dismissal.
- `cameraChanged {camera}` reports camera pan/zoom/rotation changes.
- `tokenSelect {id}` selects a token.
- `tokenMoveRequest {id,from,to,blocked,distance}` requests token movement with 80%-body-radius collision status.
- `doorToggleRequest {id,open}` requests opening or closing a door segment.
- `gridCalibrated {grid}` reports newly calibrated grid offset and cell size from 2-click calibration.
- `mapEditChange {map,action}` proposes a map editor mutation.
- `exportMap {name,archive}` emits a base64-encoded `.map` zip archive.
- `importMap {map}` emits an unpacked battlemap definition from a `.map` archive.

## Slots

- `objects`
- `overlay`

## Behavior and boundaries

Maintains a PixiJS v8 `worldContainer` scene graph (`lowerGroundsContainer`, `activeGroundContainer` with `groundSprite`, `gridGraphics`, `objectLayerContainer`, `drawingLayerContainer`, `tokenLayerContainer`, `roofLayerContainer`, `lightingAndFogContainer`, `wallControlsContainer`, `templatesAndRulerContainer`) synchronized with the DOM slot surface. Never computes authoritative visibility on the client; consumes server-projected tokens and `visionMask`. Releases listeners, observers, animation frames, and PixiJS resources on destroy.
