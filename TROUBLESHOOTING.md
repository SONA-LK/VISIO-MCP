# Troubleshooting

## Logs

Always check logs first:

```
%LOCALAPPDATA%\VisioMCP\logs\visiomcp-YYYY-MM-DD.log
```

Set `"logLevel": "debug"` in config for maximum detail.

---

## Common Problems

### "Visio is not installed"

**Symptom:** `VISIO_NOT_INSTALLED` error on any tool call.

**Causes & fixes:**

1. Visio truly isn't installed — install it.
2. Visio is installed but `winax` can't load.
   - Verify `winax.node` exists: `node_modules\winax\build\Release\winax.node`
   - Run `npm rebuild winax` to recompile the native addon.
3. Non-standard Visio install location.
   - Set `"visioPath"` in `%LOCALAPPDATA%\VisioMCP\config.json`:
     ```json
     { "visioPath": "C:\\CustomPath\\VISIO.EXE" }
     ```
   - Or set env var: `VISIOMCP_VISIO_PATH=C:\CustomPath\VISIO.EXE`

---

### "Failed to start Microsoft Visio"

**Symptom:** `VISIO_CANNOT_START` error.

**Causes & fixes:**

1. COM registration is broken — repair Office from Windows Apps settings.
2. Visio needs activation — open Visio manually once and complete activation.
3. Anti-virus blocking COM launch — add exception for `VISIO.EXE`.
4. Running as a restricted user — try running your MCP client (or a manual `npx visiomcp`) as Administrator once.

---

### "COM automation error"

**Symptom:** `VISIO_COM_FAILURE` on tool calls.

**Causes & fixes:**

1. Visio closed its window while VisioMCP was running.
   - Use `open_visio` to reconnect.
2. Visio is displaying a modal dialog (save prompt, error box).
   - Switch to the Visio window and dismiss the dialog.
3. Visio is busy (opening a large file).
   - Wait and retry — `recoverable: true` means the error is transient.

---

### "Visio is busy and rejected the request"

**Symptom:** `VISIO_COM_TIMEOUT` / `RPC_E_CALL_REJECTED`.

**Fix:** Visio is processing something. Wait a few seconds and retry.
This happens most often when Visio is rendering a large diagram or showing a dialog.

---

### "No document is currently open"

**Symptom:** `DOCUMENT_NOT_OPEN` on shape or page operations.

**Fix:** Call `create_document` or `open_document` first.

---

### "File already exists"

**Symptom:** `FILE_ALREADY_EXISTS` on `save_document` or `export_document`.

**Fix:** Either:
- Choose a different output path.
- Pass `"overwrite": true` in the tool input.
- Set `"allowSilentOverwrite": true` in config to never get this error.

---

### Shapes appear in wrong position

**Symptom:** Shapes placed at `y: 1` appear near the bottom of the page.

**Explanation:** VisioMCP translates from top-left origin (AI) to Visio's bottom-left origin automatically. If shapes still appear wrong, check that `pageIndex` matches the intended page.

---

### Connectors not visually connected to shapes

Fixed as of v0.2.0. Previously, `connect_shapes` always fell back to an unglued `DrawLine` because its "proper" strategy relied on `Application.ConnectorToolDataObject`, which the `winax` COM bridge cannot marshal (it comes back as the literal string `"[Unknown]"`, so every `Page.Drop()` call using it failed with `"DispInvoke: Drop Type mismatch"`, silently, every time). `connect_shapes` now drops the real "Dynamic connector" master instead — the same shape a user gets from the Connector tool in the Visio UI — which glues correctly. Verified with `get_connections`, which now reports real `fromShapeId`/`toShapeId` endpoints.

If you still see a floating line on an older version, upgrade, or as a workaround:
```
delete_shape (the connector)
connect_shapes (retry)
```

---

### MCP client not seeing VisioMCP tools

**Symptom:** Your AI client shows no Visio tools.

**Checks:**
1. Verify your MCP config runs `npx -y visiomcp` (or `visiomcp` if globally installed).
2. Test manually:
   ```bat
   echo {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}} | npx -y visiomcp
   ```
   You should see a JSON list of tools on stdout immediately.
3. Check the MCP client logs — some clients log MCP errors separately.
4. Restart the AI client after changing the MCP config.

---

### "require('winax') failed" in logs, or `npx`/`npm install` fails with a `node-gyp` error

**Symptom:** VisioMCP starts but immediately errors with a winax load failure, or the initial `npx visiomcp` / `npm install` itself fails with output mentioning `node-gyp rebuild`, `MSBuild`, or "Could not find any Visual Studio installation."

**Cause:** `winax` is a native COM addon — it's compiled from source the first time it's installed, and that requires a C++ build toolchain.

**Fix:** Install the "Desktop development with C++" workload from the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) installer, then retry:
```bat
npx clear-npx-cache
npx -y visiomcp
```
(or, for a global install: `npm install -g visiomcp`). The native addon must be compiled on the same Windows machine where it runs — this is a one-time step per machine.

---

### Export produces empty or corrupt file

**Symptom:** `export_document` returns success but the file is empty or won't open.

**Causes & fixes:**

- **PNG/SVG/EMF:** Ensure the page has at least one shape on it.
- **PDF:** Ensure Visio has a PDF printer driver. Office installs one by default.
- **VSDX:** If save fails, check the target directory exists and is writable.

---

## Getting More Detail

Set debug logging in `%LOCALAPPDATA%\VisioMCP\config.json`:

```json
{
  "logLevel": "debug"
}
```

Then tail the log file while running:
```bat
Get-Content "$env:LOCALAPPDATA\VisioMCP\logs\visiomcp-$(Get-Date -Format yyyy-MM-dd).log" -Wait
```
