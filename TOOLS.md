# VisioMCP — Tool Reference

All tools communicate via MCP stdio. Inputs are JSON objects. Outputs are JSON with a `success` field.

---

## Status & Lifecycle

### `get_visio_status`
Check if Visio is running and get current state.

**Input:** _(none)_

**Output:**
```json
{
  "success": true,
  "running": true,
  "version": "16.0",
  "visioPath": "C:\\Program Files\\...",
  "documentCount": 1,
  "activeDocument": "network.vsdx"
}
```

---

### `open_visio`
Start Visio. Does nothing if already running.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `visioPath` | string | No | Path to VISIO.EXE. Auto-detected if omitted. |

---

## Document Operations

### `create_document`
Create a new blank Visio drawing.

**Input:** _(none)_

**Output:** `{ "success": true, "document": { "name": "Drawing1", "pageCount": 1, ... } }`

---

### `open_document`
Open an existing `.vsdx` or `.vsd` file.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `filePath` | string | **Yes** | Absolute path to the file. |

---

### `save_document`
Save the active document.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `filePath` | string | No | Save to a new path. Omit to save in place. |
| `overwrite` | boolean | No | Overwrite existing file. Default: `false`. |

---

### `close_document`
Close the active document.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `save` | boolean | No | Save before closing. Default: `false`. |

---

### `get_document_info`
Get info about the active document.

**Output:** `{ "name", "fullPath", "saved", "pageCount", "activePageIndex", "activePageName" }`

---

## Page Operations

### `get_pages`
List all pages in the active document.

**Output:**
```json
{
  "pages": [
    { "index": 0, "name": "Page-1", "width": 11, "height": 8.5, "shapeCount": 5 }
  ],
  "pageCount": 1
}
```

---

### `create_page`
Add a new page to the document.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | Page name. Auto-named if omitted. |

---

## Shape Operations

All coordinates are in **inches from the top-left corner** of the page.

### `add_shape`
Add a shape to a page.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | **Yes** | See shape types below. |
| `x` | number | **Yes** | X position in inches. |
| `y` | number | **Yes** | Y position in inches. |
| `width` | number | No | Width in inches. Has sensible defaults per shape type. |
| `height` | number | No | Height in inches. |
| `text` | string | No | Text label. |
| `style` | object | No | See style properties below. |
| `pageIndex` | integer | No | 0-based page index. Default: 0. |

**Shape types:**
`rectangle` · `rounded-rectangle` · `ellipse` · `diamond` · `triangle` · `line` · `text` · `server` · `database` · `router` · `switch` · `firewall` · `computer` · `cloud` · `process` · `decision` · `document` · `start-end`

**Style properties:**
| Field | Type | Description |
|---|---|---|
| `fillColor` | string | Hex color e.g. `"#4472C4"` |
| `lineColor` | string | Border color as hex |
| `lineWeight` | number | Border weight in points |
| `fontColor` | string | Text color as hex |
| `fontSize` | number | Font size in points |
| `fontBold` | boolean | Bold text |
| `fontItalic` | boolean | Italic text |

**Output:**
```json
{
  "success": true,
  "shape": {
    "shapeId": "Sheet.5",
    "name": "Rectangle.5",
    "x": 1.0, "y": 1.0, "width": 2.0, "height": 1.0
  },
  "hint": "Use shapeId \"Sheet.5\" to move, resize, connect, or delete this shape."
}
```

---

### `set_shape_text`
Set the text label of a shape.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `shapeId` | string | **Yes** | e.g. `"Sheet.5"` |
| `text` | string | **Yes** | New text content. |
| `pageIndex` | integer | No | 0-based page index. |

---

### `move_shape`
Move a shape to new coordinates.

**Input:** `shapeId`, `x`, `y`, `pageIndex?`

---

### `resize_shape`
Change a shape's dimensions.

**Input:** `shapeId`, `width`, `height`, `pageIndex?`

---

### `delete_shape`
Permanently delete a shape.

**Input:** `shapeId`, `pageIndex?`

---

### `get_shapes`
List all shapes on a page.

**Input:** `pageIndex?`

**Output:**
```json
{
  "shapes": [
    {
      "id": "Sheet.1",
      "name": "Rectangle.1",
      "type": "Shape",
      "text": "Web Server",
      "x": 1.0, "y": 1.0,
      "width": 2.0, "height": 1.0,
      "pageId": 0,
      "pageName": "Page-1"
    }
  ],
  "shapeCount": 1
}
```

---

### `get_selection`
Get shapes currently selected in the Visio window.

**Input:** _(none)_

---

## Connector Operations

### `connect_shapes`
Draw a connector between two shapes.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `fromShapeId` | string | **Yes** | Source shape, e.g. `"Sheet.1"` |
| `toShapeId` | string | **Yes** | Target shape, e.g. `"Sheet.2"` |
| `text` | string | No | Connector label. |
| `pageIndex` | integer | No | 0-based page index. |

**Output:**
```json
{
  "connector": {
    "connectorId": "Sheet.3",
    "fromShapeId": "Sheet.1",
    "toShapeId": "Sheet.2"
  }
}
```

---

### `get_connections`
List all connectors on a page.

**Input:** `pageIndex?`

**Output:**
```json
{
  "connections": [
    {
      "connectorId": "Sheet.3",
      "fromShapeId": "Sheet.1",
      "fromShapeName": "Router",
      "toShapeId": "Sheet.2",
      "toShapeName": "Firewall",
      "text": ""
    }
  ],
  "count": 1
}
```

---

## Export

### `export_document`
Export to file.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `outputPath` | string | **Yes** | Absolute output path. Extension must match format. |
| `format` | string | **Yes** | `png` · `pdf` · `svg` · `emf` · `vsdx` |
| `pageIndex` | integer | No | Page to export. Omit for all pages (PDF only). |

---

## Error Responses

All tools return a consistent error structure on failure:

```json
{
  "success": false,
  "error": "Visio is not currently running.",
  "code": "VISIO_NOT_RUNNING",
  "details": "Use the open_visio tool to start Visio first.",
  "recoverable": true
}
```

**Error codes:**
| Code | Meaning |
|---|---|
| `VISIO_NOT_INSTALLED` | Visio not found on this machine |
| `VISIO_NOT_RUNNING` | Visio not running; use open_visio |
| `VISIO_CANNOT_START` | Failed to launch Visio process |
| `VISIO_COM_FAILURE` | COM communication error |
| `VISIO_COM_TIMEOUT` | Visio rejected COM call (busy) |
| `DOCUMENT_NOT_OPEN` | No document open; create or open one |
| `DOCUMENT_NOT_FOUND` | File path does not exist |
| `FILE_ALREADY_EXISTS` | Use overwrite: true to replace |
| `INVALID_FILE_PATH` | Bad extension or path characters |
| `INVALID_SHAPE_ID` | Shape ID not found; use get_shapes |
| `PAGE_NOT_FOUND` | Page index out of range |
| `INVALID_INPUT` | Zod schema validation failed |
| `UNKNOWN` | Unexpected error — see details field |
