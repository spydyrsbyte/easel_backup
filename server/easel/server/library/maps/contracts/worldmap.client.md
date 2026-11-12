# easel.maps.worldmap@1

Draggable and zoomable PixiJS v8 overland worldmap with tiles and interactive location pins linked to sub-maps or notes.

## Properties

| Property | Type | Default | Meaning |
|---|---|---|---|
| `title` | String | `""` | Optional heading for this view. |
| `disabled` | Boolean | `false` | Disables locally emitted interaction intents. |
| `open` | Boolean | `true` | Controls whether the component is visible. |
| `image` | String | `""` | Base overland map image URL. |
| `tiles` | Array | `[]` | Overland map tiles `{id,image,x,y,width,height,col,row}`. |
| `pins` | Array | `[]` | Interactive location pins `{id,label,x,y,color,linkedMapId,discovered,notes}`. |
| `selectedPinId` | String | `""` | Currently selected pin ID. |
| `camera` | Object | `{"x":0,"y":0,"zoom":1,"rotation":0}` | Camera pan/zoom/rotation state. |
| `gm` | Boolean | `false` | Shows undiscovered pins when true. |
| `width` | Number | `960` | Presentation width in pixels. |
| `height` | Number | `600` | Presentation height in pixels. |

## Local events

- `close {}` requests dismissal.
- `cameraChanged {camera}` reports camera pan/zoom changes.
- `pinSelect {id,linkedMapId}` selects a location pin and reports its linked map ID.
- `pinMove {id,x,y}` proposes moving a location pin.
- `pinCreate {x,y,label}` proposes creating a new location pin.

## Slots

This component has no child slots.

## Behavior and boundaries

Renders overland tiles and location pins using `easel.graphics.pixi@1`. Undiscovered pins (`discovered: false`) are hidden unless `gm` is true. Releases PixiJS resources on destroy.
