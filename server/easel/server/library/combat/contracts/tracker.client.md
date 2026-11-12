# easel.combat.tracker@1

Encounter tracker: initiative order, the current turn, health bars, round counter, and game master controls.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `combat` | Object | `{}` |
| `gm` | Boolean | `false` |

## Events

| Event | Payload |
|---|---|
| `start` | none |
| `end` | none |
| `next` | none |
| `previous` | none |
| `rollAll` | none |
| `addSelected` | none |
| `select` | `id` String, `tokenId` String |
| `roll` | `id` String |
| `defeated` | `id` String, `defeated` Boolean |
| `remove` | `id` String |
| `initiative` | `id` String, `initiative` Number |
