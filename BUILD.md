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

## Publishing to npm

VisioMCP is distributed as a plain npm package — no bundled exe, no custom installer. MCP clients launch it directly with `npx`/`node`.

### Step 1 — Build and test

```bat
npm run build
npm run test:unit
```

### Step 2 — Publish

```bat
npm publish
```

`prepublishOnly` runs the build automatically, and `"files": ["dist"]` keeps the published tarball to just the compiled output (plus `package.json`/`README.md`/`LICENSE`, included by npm by default).

### Automated releases

`.github/workflows/publish.yml` runs this same build+test+publish sequence on `windows-latest` whenever a `v*` tag is pushed:

```bat
git tag v0.2.0
git push origin v0.2.0
```

This requires an `NPM_TOKEN` repository secret (Settings → Secrets and variables → Actions) holding an npm automation token with publish rights for the `visiomcp` package.

### Important: winax native binary

`winax` is a native Windows COM addon (`winax.node`), compiled from source via `node-gyp` when a user runs `npx visiomcp` / `npm install`. This requires the "Desktop development with C++" Visual Studio Build Tools workload on the *user's* machine — there is nothing the maintainer needs to bundle for this; it's the standard model for any native Node addon (same as `keytar`, `robotjs`, etc.).

If a local `npm install` fails on `node-gyp rebuild`, install the Build Tools workload above and retry.

---

## MCP Client Configuration

### Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)

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

### VS Code (with MCP extension)

```json
{
  "mcp.servers": {
    "visio": {
      "command": "npx",
      "args": ["-y", "visiomcp"],
      "transport": "stdio"
    }
  }
}
```

---

## Verifying the Build

Run the built server manually to test stdio:

```bat
echo {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}} | node dist/index.js
```

Expected: JSON response listing all tools on stdout (no log output on stdout).

---

## Build Matrix

| Component | Requirement |
|---|---|
| OS | Windows 10/11 x64 |
| Node.js | 18.x+ (required on the end-user's machine, same as any npm CLI tool) |
| TypeScript | 5.3+ (dev only) |
| winax | compiled natively on install (`node-gyp`), needs VS Build Tools |
| Visio | required at runtime; not at build time |
