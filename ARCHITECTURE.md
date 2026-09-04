# VisioMCP Architecture

## Overview

VisioMCP is a Windows-only MCP (Model Context Protocol) server that bridges AI clients to Microsoft Visio via Windows COM automation.

```
┌───────────────────────────────────────────────────────────────┐
│                        USER MACHINE                           │
│                                                               │
│  ┌──────────────┐       MCP stdio       ┌─────────────────┐  │
│  │  AI Client   │ ◄───────────────────► │ VisioMCP (npx)  │  │
│  │  (Claude,    │                       │                 │  │
│  │   GPT, etc.) │                       │  ┌───────────┐  │  │
│  └──────────────┘                       │  │ MCP Layer │  │  │
│                                         │  └─────┬─────┘  │  │
│                                         │        │         │  │
│                                         │  ┌─────▼─────┐  │  │
│                                         │  │ Visio     │  │  │
│                                         │  │ Abstraction│  │  │
│                                         │  └─────┬─────┘  │  │
│                                         └────────┼────────┘  │
│                                                  │            │
│                                            Windows COM        │
│                                                  │            │
│                                         ┌────────▼────────┐  │
│                                         │ Microsoft Visio  │  │
│                                         └─────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── index.ts                    # Entry point
│
├── mcp/
│   ├── server.ts               # MCP Server (stdio transport)
│   ├── tools.ts                # Tool implementations & dispatch
│   └── schemas.ts              # Zod input/output schemas
│
├── visio/
│   ├── application.ts          # VisioApplication — COM connection
│   ├── document.ts             # VisioDocument — open/save/close/export
│   ├── shapes.ts               # VisioShapes — create/move/resize/delete
│   ├── connectors.ts           # VisioConnectors — connect shapes
│   └── detector.ts             # Visio executable detection
│
├── models/
│   ├── shape.ts                # ShapeInfo, ShapeType, ShapeStyle
│   ├── document.ts             # DocumentInfo, PageInfo, ExportOptions
│   └── connection.ts           # ConnectionInfo, ConnectShapesInput
│
├── utils/
│   ├── logger.ts               # File logger (never writes to stdout)
│   ├── paths.ts                # Path validation & normalization
│   └── errors.ts               # Structured error types
│
├── config/
│   └── config.ts               # Configuration loader
│
└── tests/
    ├── unit/                   # Unit tests (run on any OS)
    │   ├── schemas.test.ts
    │   ├── paths.test.ts
    │   ├── errors.test.ts
    │   └── config.test.ts
    └── integration/            # Windows-only COM tests
        └── visio.integration.test.ts
```

---

## Layer Responsibilities

### MCP Layer (`src/mcp/`)

- Implements the MCP protocol using `@modelcontextprotocol/sdk`
- Registers all tools with their schemas
- Validates all inputs using Zod before any Visio call
- Returns structured JSON results to the AI
- **Never** exposes COM objects to the AI

### Visio Abstraction Layer (`src/visio/`)

- All COM communication is isolated here
- Uses `winax` for Windows COM bridge
- Coordinates are in inches (Visio's native unit)
- Y-axis conversion: Visio uses bottom-left origin; we expose top-left
- Uses singleton instances: `visioApp`, `visioDocument`, `visioShapes`, `visioConnectors`

### Models (`src/models/`)

- Pure data types with no COM dependencies
- Safe to serialize/deserialize as JSON
- Represent the AI-facing view of Visio data

### Utilities (`src/utils/`)

- **logger.ts**: Writes only to `%LOCALAPPDATA%\VisioMCP\logs\`. Never stdout.
- **paths.ts**: Prevents path traversal, validates extensions, normalizes Windows paths
- **errors.ts**: Typed error codes, human-readable messages, COM error detection

---

## COM Architecture

### Connection Strategy

1. Try `GetActiveObject('Visio.Application')` — attach to running Visio
2. If not running and `autoStartVisio: true`, use `new winax.Object('Visio.Application')`
3. Auto-detect `VISIO.EXE` path; fall back to configured/env path
4. Never start a second Visio instance if one is already running

### Coordinate System

Visio uses inches with a **bottom-left origin**. The MCP API uses **top-left origin** (more intuitive for AI).

```
AI coordinates:          Visio internal:
(0,0) ─────── x         y ▲
  │                        │
  y                        └────── x
                        (0,0)
```

Conversion:
```
visioY = pageHeight - inputY - shapeHeight
inputY = pageHeight - visioY - shapeHeight
```

### Shape IDs

Visio shapes have integer IDs. VisioMCP exposes them as `Sheet.N` strings (e.g. `Sheet.5`) to make them identifiable and human-readable.

---

## Packaging

Published as a standard npm package and launched via `npx`/`node` — no custom installer or bundled exe:

```
TypeScript → tsc → dist/index.js → npm publish → npx visiomcp
```

Target machines need Node.js 18+ (already required by most MCP clients) plus the "Desktop development with C++" Visual Studio Build Tools workload, since `winax` (the native COM bridge) is compiled from source on install via `node-gyp` — the standard model for native Node addons.

---

## Security Model

| Category | Policy |
|---|---|
| COM execution | Only pre-defined operations — no arbitrary method calls |
| File access | All paths validated; extensions whitelisted |
| Path traversal | Null bytes rejected; absolute paths enforced |
| Network | stdio only; no network server exposed |
| Destructive ops | Configurable confirmation; no silent overwrites by default |
| Logging | File only; stderr for errors; never stdout |
