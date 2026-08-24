# Build Guide

## Requirements

- Windows 10 or 11 (build must happen on Windows — winax is a native addon)
- Node.js 18+
- npm 9+
- Microsoft Visio installed (for integration testing)

---

## Development Build

```bat
npm install
npm run build
```

Output: `dist/` directory with compiled JavaScript.

---

## Standalone EXE (VisioMCP.exe)

The final executable bundles the Node.js runtime and all dependencies so the target machine does **not** need Node.js installed.

### Step 1 — Install pkg globally

```bat
npm install -g pkg
```

### Step 2 — Build the project

```bat
npm run build
```

### Step 3 — Package to EXE

```bat
npm run package
```

This runs: `pkg dist/index.js --targets node18-win-x64 --output VisioMCP.exe --config pkg.config.json`

Output: `VisioMCP.exe` in the project root (~60–80 MB).

### Important: winax native binary

`winax` is a native Windows addon (`winax.node`). pkg bundles it as an asset.
The `pkg.config.json` includes:
```json
"assets": [
  "node_modules/winax/build/Release/winax.node"
]
```

If pkg cannot find the `.node` file, run:
```bat
npm rebuild winax
```

---

## Installer (VisioMCP-Setup.exe)

Use [Inno Setup](https://jrsoftware.org/isinfo.php) with the provided script:

```bat
iscc installer\VisioMCP.iss
```

The installer:
1. Checks Windows version
2. Detects Microsoft Visio installation
3. Copies `VisioMCP.exe` to `C:\Program Files\VisioMCP\`
4. Creates default config at `%LOCALAPPDATA%\VisioMCP\config.json`
5. Creates log directory `%LOCALAPPDATA%\VisioMCP\logs\`
6. Displays MCP client configuration instructions

---

## MCP Client Configuration

After installation, add to your MCP client config:

### Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "visio": {
      "command": "C:\\Program Files\\VisioMCP\\VisioMCP.exe"
    }
  }
}
```

### VS Code (with MCP extension)

```json
{
  "mcp.servers": {
    "visio": {
      "command": "C:\\Program Files\\VisioMCP\\VisioMCP.exe",
      "transport": "stdio"
    }
  }
}
```

---

## Verifying the Build

Run the EXE manually to test stdio:

```bat
echo {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}} | VisioMCP.exe
```

Expected: JSON response listing all tools on stdout (no log output on stdout).

---

## Build Matrix

| Component | Requirement |
|---|---|
| OS | Windows 10/11 x64 |
| Node.js | 18.x (bundled in EXE) |
| TypeScript | 5.3+ (dev only) |
| winax | must build natively on Windows |
| pkg | must run on Windows to bundle native addon |
| Visio | required at runtime; not at build time |
