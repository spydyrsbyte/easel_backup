# easel.surfaces.gameboard@1

Grid game board with sliding pieces, click or drag moves, legal-move hints, last-move and marked squares, coordinates, keyboard play, and a flipped view.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `columns` | Integer | `8` |
| `rows` | Integer | `8` |
| `pattern` | String | `"checker"` |
| `theme` | String | `"walnut"` |
| `pieces` | Array | `[]` |
| `selected` | Integer | `-1` |
| `targets` | Array | `[]` |
| `last` | Array | `[]` |
| `marks` | Array | `[]` |
| `flipped` | Boolean | `false` |
| `interactive` | Boolean | `false` |
| `coordinates` | Boolean | `true` |

## Events

| Event | Payload |
|---|---|
| `square` | `index` Integer, `name` String |
| `pick` | `index` Integer |
| `move` | `from` Integer, `to` Integer |
