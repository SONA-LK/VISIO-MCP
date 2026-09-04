# Changelog

All notable changes to VisioMCP are documented here.

## [0.2.0] - Unreleased

### Fixed

- **Distribution was broken.** The README told users to download `VisioMCP-Setup.exe`
  from a releases page that was never built or published (no CI/release automation
  existed). Replaced the exe/Inno-Setup-installer approach with a standard npm
  package launched via `npx`/`node` — the method MCP registries actually expect.
  - Added a shebang + `bin` entry so `npx -y visiomcp` works directly.
  - Added `.github/workflows/ci.yml` (build + unit test on every push/PR) and
    `.github/workflows/publish.yml` (npm publish on `v*` tags).
  - Removed the `pkg` dependency, `pkg.config.json`, and `installer/`.
  - Updated `README.md`, `BUILD.md`, `TROUBLESHOOTING.md` to describe the new
    install flow and the one-time Visual Studio Build Tools requirement for
    compiling the `winax` native addon.

### Added

- Ported the diagram-generation architecture from the `visio-diagram-mcp`
  sibling project: a typed diagram IR (`src/diagram/ir.ts`), a pluggable
  diagram-type registry with `activity` (real UML Activity `UACTME_U.vssx`
  stencil) and `flowchart` (`BASFLO_U.vssx`) vocabularies, a layered
  auto-layout engine with orthogonal edge routing
  (`src/diagram/layout/layered.ts`), discovery-first stencil resolution
  (`src/diagram/stencils.ts`), and a faithful rendering engine
  (`src/diagram/engine.ts`) that drops real masters where installed and
  glues connectors by computed side.
- New MCP tools: `list_diagram_types`, `get_type_vocabulary`,
  `resolve_stencil`, `validate_spec`, `analyze_requirement`, `plan_diagram`,
  `design_diagram`, plus the `diagram_from_requirement` guided-workflow
  prompt. All existing low-level shape tools (`add_shape`, `move_shape`,
  `connect_shapes`, etc.) are unchanged.

## [0.1.0]

Initial release: low-level Visio COM automation tools (documents, pages,
shapes, connectors, export).
