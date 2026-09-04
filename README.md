[![M8ven Score](https://m8ven.ai/badge/mcp/sona-lk-visio-mcp-q2d1qb)](https://m8ven.ai/mcp/sona-lk-visio-mcp-q2d1qb)

# VisioMCP

**A Windows MCP server that controls Microsoft Visio via COM automation.**

Any MCP-compatible AI client can create, edit, read, and export Visio diagrams by calling clean, structured tools — without knowing anything about COM.

```
AI Client (Claude, GPT, etc.)
       ↕ MCP / stdio
  VisioMCP.exe
       ↕ Windows COM
  Microsoft Visio
```

---

## Quick Start

### Prerequisites

- Windows 10 or 11
- Microsoft Visio (2013, 2016, 2019, 2021, or Microsoft 365)
- An MCP-compatible AI client (Claude Desktop, etc.)

### Install

1. Download `VisioMCP-Setup.exe` from the releases page.
2. Run the installer. Visio is auto-detected — no configuration needed in most cases.
3. Add VisioMCP to your MCP client config:

```json
{
  "mcpServers": {
    "visio": {
      "command": "C:\\Program Files\\VisioMCP\\VisioMCP.exe"
    }
  }
}
```

4. Restart your AI client. You should see Visio tools available.

---

## Tools

See [TOOLS.md](TOOLS.md) for the full list of available tools and their parameters.

**Document tools:** `get_visio_status`, `open_visio`, `create_document`, `open_document`, `save_document`, `close_document`, `get_document_info`

**Page tools:** `get_pages`, `create_page`

**Shape tools:** `add_shape`, `set_shape_text`, `move_shape`, `resize_shape`, `delete_shape`, `get_shapes`, `get_selection`

**Connector tools:** `connect_shapes`

**Export tools:** `export_document`

---

## Example: Network Diagram

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
