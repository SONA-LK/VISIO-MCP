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

## Diagram Generation

A higher-level pipeline on top of the shape tools above: describe a diagram in plain language, and let the AI drive **analyze → plan → design** through these tools instead of computing every shape coordinate by hand. Real Visio stencil masters (UML Activity, Basic Flowchart) are used where installed, with automatic layered layout and orthogonal connector routing. See the `diagram_from_requirement` MCP prompt for the guided workflow text.

The diagram IR (the object passed as `spec`/`analysis` between phases) uses pixels at 96dpi, top-left origin, node coordinates as centers:

```jsonc
{
  "diagram_type": "activity",
  "title": "Online purchase",
  "page": { "width_in": 8.5, "height_in": 11.0, "orientation": "portrait" },
  "nodes": [
    { "id": "start", "kind": "initial" },
    { "id": "a1", "kind": "action", "label": "Browse products" },
    { "id": "d1", "kind": "decision", "label": "Add to cart?" }
    // optional per-node: "x", "y", "w", "h" (px @96dpi, center coords), "style"
  ],
  "edges": [
    { "source": "start", "target": "a1" },
    { "source": "d1", "target": "a1", "label": "[no]" }
    // optional: "routing", "waypoints", "label_pos", "flow"
  ]
}
```

Coordinates are optional on input — omit them to auto-layout; supply them to pin exact positions (manual override always wins).

### `list_diagram_types`
List every diagram type the server can build, with a one-line description and the element-kind vocabulary each type allows. Currently ships `activity` (UML Activity) and `flowchart` (Basic Flowchart).

**Input:** _(none)_

---

### `get_type_vocabulary`
Return one diagram type's full element vocabulary: each kind's Visio master, default size, and default styling.

**Input:** `diagram_type` (string, required)

---

### `resolve_stencil`
Resolve which installed Visio stencil supplies a diagram type's masters — checks already-open documents, then candidate files, then a content-folder scan. Returns `status: "resolved"` with the stencil path, or `status: "needs_download"` (and never installs anything silently).

**Input:** `diagram_type` (string, required)

---

### `validate_spec`
Validate any diagram IR object: vocabulary/structure checks, plus geometry checks (on-page, no overlaps) once every node is positioned.

**Input:** `spec` (object, required)

**Output:** `{ "ok": boolean, "problems": string[] }`

---

### `analyze_requirement` — Phase 1
You (the AI) read the requirement, choose a `diagram_type`, and extract `nodes`/`edges` using that type's vocabulary (from `get_type_vocabulary`). This tool validates the graph and saves an `analysis.json` artifact.

**Input:** `diagram_type?`, `nodes?` (`[{id, kind, label}]`), `edges?` (`[{source, target, label?}]`), `requirement?`, `title?`, `rationale?`

Omit `diagram_type` to get the type menu back (`status: "need_type"`) instead of validating.

---

### `plan_diagram` — Phase 2
Takes the analysis (or any IR spec) and computes a concrete, positioned layout: ranks/rows, orthogonal edge routing, guard-label placement. Explicit `x`/`y` on any node, or explicit edge `waypoints`, are preserved.

**Input:** `spec` (object, required — the analysis from phase 1)

---

### `design_diagram` — Phase 3
Renders the positioned spec in Visio and saves `<out_basename>.vsdx` + `<out_basename>.png`. Resolves the stencil first; if it isn't installed, returns `status: "needs_download"` and renders nothing unless `allow_primitive_fallback: true`. Visio stays open and visible.

**Input:**
| Field | Type | Required | Description |
|---|---|---|---|
| `spec` | object | **Yes** | The positioned spec from `plan_diagram`. |
| `out_basename` | string | No | Output file base name (no extension). Default: `"diagram"`. |
| `out_dir` | string | No | Output directory. Default: current working directory. |
| `png_dpi` | integer | No | PNG export resolution. Default: `150`. |
| `allow_primitive_fallback` | boolean | No | Draw with primitives if the stencil isn't installed. Default: `false`. |

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
