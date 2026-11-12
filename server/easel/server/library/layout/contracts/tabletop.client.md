# easel.layout.tabletop@1

Full-screen table frame: a canvas that fills the view with a tool rail, scene bar, hotbar, player list, sidebar, floating windows, toasts, and a turn banner laid over it.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `sidebarOpen` | Boolean | `true` |
| `sidebarWidth` | Number | `340` |
| `toasts` | Array | `[]` |
| `banner` | Object | `{}` |

## Events

| Event | Payload |
|---|---|
| `sidebarToggle` | `open` Boolean |
| `toastDismiss` | `id` String |
| `insets` | `insets` Object |

## Slots

`canvas`, `top`, `rail`, `bottom`, `corner`, `status`, `sidebar`, `windows`
