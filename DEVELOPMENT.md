# Development Guide

## Prerequisites

- Windows 10 or 11
- Microsoft Visio installed (any version 2013+)
- Node.js 18 or later
- npm 9 or later
- TypeScript knowledge

> Unit tests (schema/error/path validation) can be run on any OS.
> Integration tests require Windows + Visio.

---

## Setup

```bat
git clone <repo>
cd VisioMCP
npm install
```

---

## Project Structure

```
src/
├── index.ts              Entry point
├── mcp/
│   ├── server.ts         MCP Server (stdio transport)
│   ├── tools.ts          Low-level tool dispatch + handlers
│   ├── schemas.ts        Zod input schemas
│   ├── diagramTools.ts   analyze/plan/design tool handlers + prompt
│   └── diagramSchemas.ts Zod schemas for the diagram IR + tool inputs
├── visio/
│   ├── application.ts    COM connection to Visio.Application
│   ├── document.ts       Document open/save/close/export
│   ├── shapes.ts         Shape CRUD and manipulation
│   ├── connectors.ts     Shape connectors
│   └── detector.ts       VISIO.EXE detection
├── diagram/              Diagram-generation pipeline (see ARCHITECTURE.md)
│   ├── ir.ts              Page/Node/Edge/Diagram + validation
│   ├── types/             KindSpec/TypeSpec registry + builtin types
│   ├── layout/layered.ts  Auto-layout: rank -> order -> coords -> routing
│   ├── stencils.ts        Discovery-first stencil resolution
│   └── engine.ts          VisioEngine — renders the IR via COM
├── models/
│   ├── shape.ts          ShapeInfo, ShapeType, default sizes
│   ├── document.ts       DocumentInfo, PageInfo, ExportOptions
│   └── connection.ts     ConnectionDetail, ConnectShapesInput
├── utils/
│   ├── logger.ts         File logger (NEVER writes to stdout)
│   ├── paths.ts          Path validation and normalization
│   └── errors.ts         Typed error classes
├── config/
│   └── config.ts         Config loader (%LOCALAPPDATA%\VisioMCP\config.json)
└── tests/
    ├── unit/             Platform-independent unit tests
    └── integration/      Windows + Visio integration tests
```

---

## Running in Development

### Type-check only (no compilation)
```bat
npm run lint
```

### Build
```bat
npm run build
```
Output goes to `dist/`.

### Run (after build)
```bat
npm start
```

### Run with ts-node (no build step)
```bat
npm run dev
```

---

## Testing

### Unit tests (any OS)
```bat
npm test
```
Tests: schema validation, path utilities, error classes, config defaults.

### Integration tests (Windows + Visio required)
```bat
npm run test:integration
```
Tests: actual COM automation, Visio lifecycle, Hello World flow, shape/connector operations.

**Important:** Integration tests use the real Visio application. They will:
- Start Visio if not running
- Create and delete test documents in `%TEMP%\VisioMCP_IntegrationTests\`
- Leave Visio open after tests complete

---

## Connecting an MCP Client During Development

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "visio-dev": {
      "command": "node",
      "args": ["C:\\path\\to\\VisioMCP\\dist\\index.js"]
    }
  }
}
```

Or with ts-node for live development:
```json
{
  "mcpServers": {
    "visio-dev": {
      "command": "npx",
      "args": ["ts-node", "C:\\path\\to\\VisioMCP\\src\\index.ts"]
    }
  }
}
```

---

## Logging

Logs are at: `%LOCALAPPDATA%\VisioMCP\logs\visiomcp-YYYY-MM-DD.log`

Log levels: `debug` | `info` | `warn` | `error`

Set in config:
```json
{ "logLevel": "debug" }
```

**Critical:** Never use `console.log` or write to stdout. stdout is the MCP protocol channel.
Always use `logger.info(...)`, `logger.error(...)`, etc.

---

## Adding a New Tool

1. Add the Zod schema to `src/mcp/schemas.ts`
2. Add the tool definition (name, description, inputSchema) to the `TOOLS` array in `src/mcp/tools.ts`
3. Add the handler `case` in `handleTool()` in `src/mcp/tools.ts`
4. If new Visio logic is needed, add it to the appropriate `src/visio/*.ts` file
5. Add unit tests in `src/tests/unit/`
6. Add the tool to `TOOLS.md`

---

## Adding a Diagram Type

The diagram-generation pipeline (`src/diagram/`) is deliberately type-agnostic — adding a new diagram type (e.g. BPMN, ER diagrams) needs no changes to the IR, layout engine, stencil resolver, rendering engine, or MCP tools:

1. Create `src/diagram/types/<name>.ts`, building a `TypeSpec` (vocabulary → `KindSpec` masters/sizes/styles, candidate stencil filenames, layout strategy, edge style) and calling `register(spec)`. Use `src/diagram/types/activity.ts` or `flowchart.ts` as a template.
2. Import it from `src/diagram/types/index.ts`.
3. Add unit tests in `src/tests/unit/diagram/registry.test.ts` (or a new file) covering the vocabulary.

---

## Code Style Rules

- All Visio COM calls must be in `src/visio/` — never in `src/mcp/`
- Never expose COM objects outside `src/visio/`
- Always `await visioApp.ensureConnected()` before COM calls
- Wrap all COM calls in try/catch and use `wrapError()`
- Use `logger.*` instead of `console.*` everywhere
- Return `ToolResult` from all tool handlers — never throw from `handleTool()`

---

## COM Notes

### winax API
```typescript
// Get existing instance (like GetActiveObject)
const app = wx.GetObject('', 'Visio.Application');

// Create new instance (like CreateObject)
const app = new wx.Object('Visio.Application');

// Read a property
const name = app.Name;           // string
const count = Number(app.Documents.Count);

// Call a method
const doc = app.Documents.Add('');
const shape = page.DrawRectangle(x1, y1, x2, y2);

// Set a ShapeSheet cell formula
shape.CellsU('FillForegnd').FormulaU = 'RGB(255,0,0)';

// Set a ShapeSheet cell result (with unit)
shape.CellsU('Width').SetResult('in', 2.5, 0);
```

### Coordinate System
Visio uses inches with bottom-left origin. VisioMCP exposes top-left origin to the AI.

```
AI input (top-left):     Visio internal (bottom-left):
(0,0)──── x              y ▲
  │                         │
  y                         └──── x
                          (0,0)
```

Conversion: `visioY = pageHeight - inputY - shapeHeight`
