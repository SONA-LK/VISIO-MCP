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
│   ├── tools.ts                # Low-level tool implementations & dispatch
│   ├── schemas.ts              # Zod input/output schemas
│   ├── diagramTools.ts         # analyze/plan/design tool handlers + prompt
│   └── diagramSchemas.ts       # Zod schemas for the diagram IR + tool inputs
│
├── visio/
│   ├── application.ts          # VisioApplication — COM connection
│   ├── document.ts             # VisioDocument — open/save/close/export
│   ├── shapes.ts                # VisioShapes — create/move/resize/delete
│   ├── connectors.ts            # VisioConnectors — connect shapes
│   └── detector.ts              # Visio executable detection
│
├── diagram/                    # Diagram-generation pipeline (ported from
│   │                            # visio-diagram-mcp) — COM-free logic and
│   │                            # the COM rendering engine, kept separate.
│   ├── ir.ts                   # Page/Node/Edge/Diagram + validation
│   ├── types/
│   │   ├── registry.ts          # KindSpec/EdgeStyle/TypeSpec registry
│   │   ├── activity.ts          # "activity" (UML Activity) builtin type
│   │   ├── flowchart.ts         # "flowchart" (Basic Flowchart) builtin type
│   │   └── index.ts             # registers the builtin types
│   ├── layout/
│   │   └── layered.ts           # rank -> order -> coords -> route edges
│   ├── stencils.ts              # discovery-first stencil resolution
│   └── engine.ts                # VisioEngine — renders the IR via COM
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
    │   ├── config.test.ts
    │   └── diagram/            # ir/registry/layout/stencils/engine-helpers
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

### Diagram Generation Layer (`src/diagram/`)

Ported from the sibling `visio-diagram-mcp` (Python) project. Split the same way as `src/visio/` vs. the rest — COM-free logic is isolated so it stays testable on any OS:

- **COM-free** (`ir.ts`, `types/*.ts`, `layout/layered.ts`, `stencils.ts`'s resolution logic): the diagram IR (px @96dpi, top-left origin, node coordinates as centers), the diagram-type registry (vocabulary → Visio master/style/size per element kind), and the layered auto-layout algorithm (rank → order → coordinates → orthogonal edge routing with side lanes for skips/loops).
- **COM** (`engine.ts`): `VisioEngine` renders a positioned `Diagram` into a fresh Visio document — drops real stencil masters where resolved (primitive-drawn fallback otherwise), styles fill/line/text, glues connectors by computed side (`GlueToPos`) rather than plain center-to-center, and exports `.vsdx`/`.png`. Reuses the `visioApp` singleton for connection rather than a second independent COM strategy.
- Diagram types are pluggable: `types/registry.ts` exposes `register()`; adding a new type is a new file under `types/` (see `activity.ts`/`flowchart.ts`) with no changes needed elsewhere.

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
