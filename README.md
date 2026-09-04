[![M8ven Score](https://m8ven.ai/badge/mcp/sona-lk-visio-mcp-q2d1qb)](https://m8ven.ai/mcp/sona-lk-visio-mcp-q2d1qb)

# VisioMCP

**A Windows MCP server that controls Microsoft Visio via COM automation.**

Any MCP-compatible AI client can create, edit, read, and export Visio diagrams by calling clean, structured tools — without knowing anything about COM.

```
AI Client (Claude, GPT, etc.)
       ↕ MCP / stdio
  VisioMCP (npx / node)
       ↕ Windows COM
  Microsoft Visio
```

---

## Quick Start

### Prerequisites

- Windows 10 or 11
- Microsoft Visio (2013, 2016, 2019, 2021, or Microsoft 365)
- Node.js 18+
- An MCP-compatible AI client (Claude Desktop, Claude Code, etc.)
- The "Desktop development with C++" workload from [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — `winax`, the Windows COM bridge VisioMCP uses to talk to Visio, is a native addon compiled on install. This is a one-time setup step, same as any other native Node addon (e.g. `keytar`, `robotjs`).

### Install

Add VisioMCP to your MCP client config — no download or installer needed, `npx` fetches and runs the package on first use:

```json
{
  "mcpServers": {
    "visio": {
      "command": "npx",
      "args": ["-y", "visiomcp"]
    }
  }
}
```

Restart your AI client. You should see Visio tools available. (npx will compile the native `winax` addon the first time it runs, which takes a little longer than a normal npx invocation — this only happens once.)

Prefer a permanent install? `npm install -g visiomcp` and point `command` at `visiomcp` directly instead of `npx`.

---

## Tools

See [TOOLS.md](TOOLS.md) for the full list of available tools and their parameters.

**Document tools:** `get_visio_status`, `open_visio`, `create_document`, `open_document`, `save_document`, `close_document`, `get_document_info`

**Page tools:** `get_pages`, `create_page`

**Shape tools:** `add_shape`, `set_shape_text`, `move_shape`, `resize_shape`, `delete_shape`, `get_shapes`, `get_selection`

**Connector tools:** `connect_shapes`

**Export tools:** `export_document`

**Diagram generation tools:** `list_diagram_types`, `get_type_vocabulary`, `resolve_stencil`, `validate_spec`, `analyze_requirement`, `plan_diagram`, `design_diagram` — a higher-level **analyze → plan → design** pipeline: describe a diagram in plain language and let the AI drive real Visio stencils (UML Activity, Basic Flowchart) through automatic layered layout and orthogonal connector routing, instead of placing every shape by hand. See the `diagram_from_requirement` prompt and the [Diagram Generation](TOOLS.md#diagram-generation) section of TOOLS.md.

---

## Example: Diagram Generation (analyze → plan → design)

```
User: Draw a UML activity diagram for an online purchase flow.

AI calls:
1. list_diagram_types                         -> picks "activity"
2. get_type_vocabulary { diagram_type: "activity" }
3. analyze_requirement { diagram_type: "activity", nodes: [...], edges: [...] }
4. plan_diagram { spec: <analysis> }          -> auto-layout + routing
5. resolve_stencil { diagram_type: "activity" }
6. design_diagram { spec: <positioned spec>, out_basename: "purchase-flow" }
   -> purchase-flow.vsdx + purchase-flow.png, real UML masters, orthogonal connectors
```

## Example: Network Diagram (low-level shape tools)

```
User: Create a network diagram with a router, firewall, and server.

AI calls:
1. open_visio
2. create_document
3. add_shape { type: "rectangle", x: 4, y: 1, text: "Router" }
4. add_shape { type: "rectangle", x: 4, y: 3, text: "Firewall" }
5. add_shape { type: "rectangle", x: 4, y: 5, text: "Server" }
6. connect_shapes { fromShapeId: "Sheet.1", toShapeId: "Sheet.2" }
7. connect_shapes { fromShapeId: "Sheet.2", toShapeId: "Sheet.3" }
8. save_document { filePath: "C:\\Diagrams\\network.vsdx" }
```

---

## Configuration

Config file: `%LOCALAPPDATA%\VisioMCP\config.json`

```json
{
  "visioPath": "C:\\Program Files\\Microsoft Office\\root\\Office16\\VISIO.EXE",
  "autoStartVisio": true,
  "confirmDestructiveActions": false,
  "logLevel": "info",
  "comTimeoutMs": 30000,
  "allowSilentOverwrite": false
}
```

All fields are optional. VisioMCP auto-detects Visio if `visioPath` is not set.

You can also set `VISIOMCP_VISIO_PATH` as an environment variable.

---

## Logs

Logs are written to: `%LOCALAPPDATA%\VisioMCP\logs\visiomcp-YYYY-MM-DD.log`

Never written to stdout (reserved for MCP protocol communication).

---

## Security

- No arbitrary COM execution exposed
- No network server — stdio only
- All file paths validated and normalized
- No silent file overwrites by default

---

## License

MIT
