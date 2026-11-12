# easel.layout.tabs@1

Tabbed content selector with per-tab slots and active-tab change events.

## Properties

| Property | Type | Default | Meaning |
|---|---|---|---|
| `title` | String | `""` | Optional heading for this view. |
| `disabled` | Boolean | `false` | Disables locally emitted interaction intents. |
| `open` | Boolean | `true` | Controls whether the component is visible. |
| `items` | Array | `[]` | Projected entries with string id and optional label/name, description, value, image, actions or child items. |
| `selected` | Array | `[]` | Controlled array of selected string identifiers; update it in response to selection intents. |
| `multiple` | Boolean | `false` | Allows selection of multiple entries. |
| `fields` | Array | `[]` | Field descriptors: id/path, label and type (text, number, checkbox or textarea). |
| `actions` | Array | `[]` | Action descriptors with id, label and optional disabled flag. |
| `active` | String | `""` | Identifier of the active tab, actor, phase or workflow step. |

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
- `tab0`
- `tab1`
- `tab2`
- `tab3`
- `tab4`
- `tab5`
- `tab6`
- `tab7`
- `tab8`
- `tab9`
- `tab10`
- `tab11`
- `tab12`
- `tab13`
- `tab14`
- `tab15`

## Behavior and boundaries

Empty collections render an empty view; missing optional fields use the declared defaults. Rendering uses text nodes, safe image URLs and projected data. Data marked face-down is rendered without its name or oracle text. Lists are bounded to 10,000 displayed items; virtualized or paged state should be supplied for larger tables. Invalid top-level types fail component validation; nested numeric camera values and grid/clock limits are checked by the implementation. Pure display updates do not grant authority or mutate caller data. Selection is controlled by the consumer, and move/edit/transfer controls only emit requests.

Components release their listeners, observers and presentation timers on destroy. Timers only update displayed text; game deadlines and scheduled actions use the existing server event service.

Up to sixteen tabs may mount independent content in `tab0` through `tab15`; `body` is an optional shared active-content slot. Changing the active tab hides other panels without destroying their components.
