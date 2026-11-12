# easel.narrative.journal@2

Journal page that reads as formatted text and edits as plain text, with a private or shared switch.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `entry` | Object | `{}` |
| `canEdit` | Boolean | `false` |

## Events

| Event | Payload |
|---|---|
| `save` | `name` String, `content` String, `playerVisible` Boolean |
