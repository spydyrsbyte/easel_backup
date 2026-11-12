# easel.characters.playbook@1

Configurable narrative-style character/playbook layout; no game-specific moves.

## Properties

| Property | Type | Default | Meaning |
|---|---|---|---|
| `title` | String | `""` | Optional heading for this view. |
| `disabled` | Boolean | `false` | Disables locally emitted interaction intents. |
| `open` | Boolean | `true` | Controls whether the component is visible. |
| `data` | Object | `{}` | Caller-projected presentation record. Fields depend on the member; identifiers do not grant authority. |
| `fields` | Array | `[]` | Field descriptors: id/path, label and type (text, number, checkbox or textarea). |
| `editable` | Boolean | `true` | Shows editors which emit change intents; never writes records. |

## Local events

All event payloads are validated by the component manager. No event sends a server request by itself. A consumer wires only the intents it supports. Common payloads are:

- `select {id}` and `selection {ids}` identify visible entries.
- `change {value}` contains a proposed field/setting patch.
- `request {action,value}` carries an action ID and its plain-data options.
- `action {id}` chooses an action without options.
- `reorder {id,before}` proposes a position; empty before means the end.
- `drag {id}` and `drop {id,source,destination,x,y}` describe a requested transfer.
- `inspect {id}` requests examination of a visible card.
- `close {}` requests dismissal.
- Camera intents are `rotate {degrees}`, `zoom {factor}`, `view {seat}` and `cameraChanged {camera}`.
- Spatial controls emit `move {x,y}`, `resize {width,height}`, `ratio {ratio}`, `position {x,y}` or `measure {distance,from,to}` where relevant.

Only the interactions offered by this member produce these intents; the shared event vocabulary allows consumers to use consistent wiring.

## Slots

- `body`

## Behavior and boundaries

Empty collections render an empty view; missing optional fields use the declared defaults. Rendering uses text nodes, safe image URLs and projected data. Data marked face-down is rendered without its name or oracle text. Lists are bounded to 10,000 displayed items; virtualized or paged state should be supplied for larger tables. Invalid top-level types fail component validation; nested numeric camera values and grid/clock limits are checked by the implementation. Pure display updates do not grant authority or mutate caller data. Selection is controlled by the consumer, and move/edit/transfer controls only emit requests.

Components release their listeners, observers and presentation timers on destroy. Timers only update displayed text; game deadlines and scheduled actions use the existing server event service.
