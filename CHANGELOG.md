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

## [0.1.0]

Initial release: low-level Visio COM automation tools (documents, pages,
shapes, connectors, export).
