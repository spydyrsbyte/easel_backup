# easel.display.seat@1

Player seat: who sits there, whose turn it is, a running clock, captured pieces, and sit or leave controls.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `name` | String | `""` |
| `image` | String | `""` |
| `color` | String | `""` |
| `label` | String | `""` |
| `swatch` | String | `""` |
| `status` | String | `""` |
| `open` | Boolean | `false` |
| `you` | Boolean | `false` |
| `turn` | Boolean | `false` |
| `canSit` | Boolean | `false` |
| `canLeave` | Boolean | `false` |
| `sitLabel` | String | `"Sit here"` |
| `clock` | Boolean | `true` |
| `elapsed` | Number | `0` |
| `running` | Boolean | `false` |
| `startedAt` | Number | `0` |
| `limit` | Number | `0` |
| `captured` | Array | `[]` |
| `advantage` | String | `""` |

## Events

| Event | Payload |
|---|---|
| `sit` | none |
| `leave` | none |
