# easel.layout.window@2

Floating window that is dragged by its title bar, resized from its corner, minimized, raised on click, and closed with Escape.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `title` | String | `""` |
| `subtitle` | String | `""` |
| `icon` | String | `""` |
| `x` | Number | `80` |
| `y` | Number | `80` |
| `width` | Number | `420` |
| `height` | Number | `480` |
| `minimized` | Boolean | `false` |
| `closable` | Boolean | `true` |
| `resizable` | Boolean | `true` |

## Events

| Event | Payload |
|---|---|
| `move` | `x` Number, `y` Number |
| `resize` | `width` Number, `height` Number |
| `close` | none |
| `focus` | none |
| `minimize` | `minimized` Boolean |

## Slots

`content`
