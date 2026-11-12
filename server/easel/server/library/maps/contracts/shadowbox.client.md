# easel.maps.shadowbox@1

PixiJS v8 16:9 theatrical stage with hierarchical group visibility, visual filters (tint, saturation, contrast, luminance, chroma-key), dialogue boxes, GM reveal toggles, and `.box` zip archives.

## Properties

| Property | Type | Default | Meaning |
|---|---|---|---|
| `title` | String | `""` | Optional heading for this view. |
| `disabled` | Boolean | `false` | Disables locally emitted interaction intents. |
| `open` | Boolean | `true` | Controls whether the component is visible. |
| `scene` | Object | `{}` | Shadowbox scene definition. |
| `groups` | Array | `[]` | Z-ordered visual groups `{id,name,visible,zIndex,alpha,tint,saturation,contrast,luminance,chromaKey,elements}`. |
| `elements` | Array | `[]` | Stage props and character portraits `{id,name,image,x,y,width,height,visible,groupId,tint,saturation,contrast,luminance,chromaKey}`. |
| `dialogue` | Object | `{}` | Active speaker dialogue `{speaker,text,portrait,visible}`. |
| `gm` | Boolean | `false` | Enables GM element visibility toggle controls. |
| `width` | Number | `960` | Presentation width in pixels (height scales to 16:9). |
| `height` | Number | `540` | Presentation height in pixels. |

## Local events

- `close {}` requests dismissal.
- `speak {speaker,text}` requests displaying or advancing dialogue.
- `toggleElements {ids,visible}` requests revealing or hiding stage elements.
- `select {id}` selects a stage element.
- `change {value}` proposes a stage property update.
- `exportBox {name,archive}` emits a base64-encoded `.box` zip archive.
- `importBox {box}` emits an unpacked shadowbox definition from a `.box` archive.

## Slots

This component has no child slots.

## Behavior and boundaries

Renders a 16:9 stage using `easel.graphics.pixi@1` (`ColorMatrixFilter` for per-group and per-element tint, saturation, contrast, luminance, and chroma-key transparency). Releases PixiJS resources on destroy.
