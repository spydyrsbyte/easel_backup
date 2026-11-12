# easel.input.hotbar@1

Numbered quick-use bar. Slots are used by click or number key, filled by drop, and edited from a menu.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `slots` | Array | `[]` |
| `size` | Integer | `10` |
| `shortcuts` | Boolean | `true` |

## Events

| Event | Payload |
|---|---|
| `use` | `index` Integer, `id` String |
| `assign` | `index` Integer |
| `clear` | `index` Integer |
| `drop` | `index` Integer, `data` Object |
