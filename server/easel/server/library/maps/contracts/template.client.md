# easel.maps.template@1

Interactive PixiJS v8 area-of-effect template overlay (burst/circle, 90°/60° cones, ray/line, rectangle) with grid-cell highlighting.

## Properties

| Property | Type | Default | Meaning |
|---|---|---|---|
| `title` | String | `""` | Optional heading for this view. |
| `disabled` | Boolean | `false` | Disables locally emitted interaction intents. |
| `open` | Boolean | `true` | Controls whether the component is visible. |
| `templates` | Array | `[]` | Active AoE templates `{id,kind,origin,radius,length,width,direction,angle,color,alpha,label}`. |
| `activeTemplate` | Object | `{}` | Preview template configuration being placed. |
| `grid` | Object | `{"offsetX":0,"offsetY":0,"cellSize":64,"scale":5,"unit":"ft","snap":true}` | Grid alignment configuration for cell highlighting. |
| `width` | Number | `800` | Presentation width in pixels. |
| `height` | Number | `600` | Presentation height in pixels. |

## Local events

- `close {}` requests dismissal.
- `place {template}` proposes placing a new AoE template at pointer coordinates.
- `move {id,x,y,direction}` proposes moving or rotating an existing template.
- `remove {id}` proposes removing a template.
- `select {id}` selects a template.

## Slots

This component has no child slots.

## Behavior and boundaries

Renders AoE polygons and highlighted grid cells using `easel.graphics.pixi@1`. Emits local intents only and cleans up its PixiJS application on destroy.
