# easel.maps.layertree@1

Tree of layers or scene elements with selection, visibility switches, hover preview, and a context menu.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `nodes` | Array | `[]` |
| `selected` | String | `""` |
| `actions` | Array | `[]` |
| `emptyText` | String | `""` |

## Events

| Event | Payload |
|---|---|
| `select` | `id` String, `kind` String |
| `visibility` | `id` String, `visible` Boolean |
| `preview` | `id` String |
| `action` | `id` String, `action` String |
