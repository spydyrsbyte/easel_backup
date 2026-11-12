# easel.collections.browser@2

Searchable directory with folders, thumbnails, badges, per-entry menus, and entries that drag onto a map or into a folder.

## Properties

| Property | Type | Default |
|---|---|---|
| `disabled` | Boolean | `false` |
| `items` | Array | `[]` |
| `folders` | Array | `[]` |
| `selected` | String | `""` |
| `kind` | String | `""` |
| `icon` | String | `"file"` |
| `canCreate` | Boolean | `false` |
| `canManage` | Boolean | `false` |
| `allowFolders` | Boolean | `true` |
| `draggable` | Boolean | `true` |
| `createLabel` | String | `"New"` |
| `placeholder` | String | `"Search"` |
| `emptyTitle` | String | `"Nothing here yet"` |
| `emptyText` | String | `""` |
| `actions` | Array | `[]` |

## Events

| Event | Payload |
|---|---|
| `select` | `id` String |
| `open` | `id` String |
| `create` | `folderId` String |
| `createFolder` | `parentId` String |
| `action` | `id` String, `action` String |
| `folderAction` | `id` String, `action` String |
| `move` | `id` String, `folderId` String |
