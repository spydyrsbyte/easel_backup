# easel.input.form@1

Property form built from a list of field descriptions: text, number, range, colour, switch, segment, select, image, textarea, and action rows.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `fields` | Array | `[]` |
| `values` | Object | `{}` |
| `actions` | Array | `[]` |
| `readOnly` | Boolean | `false` |
| `emptyText` | String | `""` |
| `emptyIcon` | String | `"pointer"` |

## Events

| Event | Payload |
|---|---|
| `change` | `id` String, `value` Object |
| `file` | `id` String, `file` Object |
| `action` | `id` String |
| `submit` | `values` Object |
