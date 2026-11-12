# easel.narrative.chat@1

Chat log and composer with grouped messages, roll cards, whisper and roll modes, quick dice, message history, and a new-messages jump.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `messages` | Array | `[]` |
| `members` | Array | `[]` |
| `userId` | String | `""` |
| `mode` | String | `"public"` |
| `modes` | Array | `["public","gm","blind","self"]` |
| `quickDice` | Array | `[]` |
| `readOnly` | Boolean | `false` |

## Events

| Event | Payload |
|---|---|
| `send` | `text` String, `mode` String |
| `mode` | `mode` String |
| `cardAction` | `messageId` String, `action` String, `payload` Object |
