# easel.layout.gametable@1

Board game frame: a board that fills the space between two seats, a side panel with a status line and action buttons, a result card, and toasts.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `status` | String | `""` |
| `detail` | String | `""` |
| `statusIcon` | String | `""` |
| `statusTone` | String | `""` |
| `actions` | Array | `[]` |
| `result` | Object | `{}` |
| `toasts` | Array | `[]` |

## Events

| Event | Payload |
|---|---|
| `action` | `id` String |
| `resultAction` | `id` String |
| `toastDismiss` | `id` String |

## Slots

`top`, `board`, `bottom`, `sidebar`
