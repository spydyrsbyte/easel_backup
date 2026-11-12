# easel.maps.fog@1

Render server-projected known/unknown map areas and vision masks using PixiJS v8; not a security boundary itself.

## Properties

| Property | Type | Default | Meaning |
|---|---|---|---|
| `title` | String | `""` | Optional heading for this view. |
| `disabled` | Boolean | `false` | Disables locally emitted interaction intents. |
| `open` | Boolean | `true` | Controls whether the component is visible. |
| `regions` | Array | `[]` | Projected polygons with points [{x,y}], label, color, known/controller/contested flags as applicable. |
| `visionMask` | Object | `{}` | Server-projected sampled RGBA vision mask `{width,height,rgba}` (R = detail, G = desaturation). |
| `ambientLight` | String | `"NORMAL"` | Scene ambient illumination level (`DARK`, `DIM`, `NORMAL`, `BRIGHT`). |
| `gm` | Boolean | `false` | Renders fog semi-transparently when viewing in GM mode. |
| `width` | Number | `600` | Presentation width in pixels. |
| `height` | Number | `400` | Presentation height in pixels. |
| `opacity` | Number | `0.9` | Opacity clamped to [0,1]. |

## Local events

All event payloads are validated by the component manager. No event sends a server request by itself. A consumer wires only the intents it supports:

- `close {}` requests dismissal.

## Slots

This component has no child slots.

## Behavior and boundaries

Empty collections render an empty view; missing optional fields use the declared defaults. Decodes server-projected `visionMask` RGBA payloads into a PixiJS v8 blurred fog/desaturation overlay and renders unseen polygon regions. Never computes authoritative token visibility on the client. Components release their listeners, observers and PixiJS resources on destroy.
