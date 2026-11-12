# easel.characters.statsheet@1

Character sheet drawn from a layout description: portrait and name, tabs, rollable statistics, resource bars, field rows, editable lists, and notes.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `actor` | Object | `{}` |
| `layout` | Object | `{}` |
| `values` | Object | `{}` |
| `readOnly` | Boolean | `false` |

## Events

| Event | Payload |
|---|---|
| `change` | `path` String, `value` Object |
| `roll` | `id` String, `label` String, `modifier` Number |
| `image` | `file` Object |
| `rename` | `name` String |
| `listAdd` | `id` String |
| `listRemove` | `id` String, `index` Integer |
