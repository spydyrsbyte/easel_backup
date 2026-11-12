# easel.maps.scenenav@1

Scene bar showing which scene players are in and which one the viewer is looking at, with game master actions.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `scenes` | Array | `[]` |
| `viewing` | String | `""` |
| `gm` | Boolean | `false` |

## Events

| Event | Payload |
|---|---|
| `view` | `id` String |
| `activate` | `id` String |
| `action` | `id` String, `action` String |
| `create` | none |
