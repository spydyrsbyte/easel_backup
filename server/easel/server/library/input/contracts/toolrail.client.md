# easel.input.toolrail@1

Icon tool palette with exclusive tools, toggles, one-shot actions, grouped flyouts, tooltips, and single-key shortcuts.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `tools` | Array | `[]` |
| `active` | String | `"select"` |
| `orientation` | String | `"vertical"` |
| `shortcuts` | Boolean | `true` |

## Events

| Event | Payload |
|---|---|
| `select` | `id` String |
| `toggle` | `id` String, `on` Boolean |
| `action` | `id` String |
