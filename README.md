# Markdown Note Taker

A local note-taking app for project notes, personal documentation, and technical writing. Organize nested folders, write in a rich editor, edit Mermaid diagrams, and import or export Markdown. Raw Markdown stays in SQLite on your computer.

**Status:** The initial release is implemented in the PR stack and awaiting review. Folder navigation, lifecycle controls, rich writing, diagrams, autosave/conflict recovery, Markdown portability, keyboard interaction, and local production execution have recorded verification in the [initial project roadmap](roadmaps/initial-project.md).

## Development setup

Use Node.js 24 LTS (24.18.0 or newer within the 24.x line) and npm 11 or 12. Installation and checks were verified on Windows 11 x64 with Node.js 24.18.0 and npm 12.2.2. Node 24 is a [supported LTS line](https://github.com/nodejs/Release). SQLite runs through the native [better-sqlite3 dependency](https://github.com/WiseLibs/better-sqlite3); no separate database service is needed.

Required npm 12 install-script rules are already recorded in package.json; no manual script approval is needed. The checks below verify that SQLite's Windows native binary loads.

From the repository root:

```powershell
npm ci
```

Start the backend in one terminal:

```powershell
npm run dev:backend
```

Start the frontend in a second terminal, also from the repository root:

```powershell
npm run dev:frontend
```

Open http://127.0.0.1:5173. Vite serves React and proxies /api to Express at http://127.0.0.1:3001. Both processes bind to 127.0.0.1. Both apps import contracts directly from TypeScript source; there is no package build or separate compiler watcher. Stop each terminal with Ctrl+C. You can still use `npm run dev` to start everything together.

Optionally copy .env.example to .env at the repository root and change PORT to select the Express port; Vite reads the same setting. Restart development after changing it. The frontend port is fixed at 5173 and startup fails if it is occupied. Environment files are ignored by Git except for .env.example. The backend creates and migrates data/workspace.sqlite before opening HTTP. Set DATA_DIR in .env to use another local directory; absolute paths are used directly, and relative paths resolve from the repository root in both development and production. Data files are ignored by Git. See [storage and backup guidance](docs/architecture/runtime.md#data-directory-and-backup).

## Checks

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:production
```

The development browser suite uses an isolated temporary database; ports 5173 and 3001 must be free. After building, the production suite starts the built app on available loopback ports and verifies restart and stopped-server backup/restore with temporary storage. Both launchers clean up their own processes and data. Chromium installation is only needed once per Playwright browser version. Unit/integration checks use isolated databases, including migration rollback, foreign keys, and reopen durability. Use npm run format to apply formatting.

## Run a production build locally

```powershell
npm run build
npm start
```

Open http://127.0.0.1:3001 (or the configured PORT). Express serves the built page, editor/diagram assets, and API together without Vite or a runtime CDN. Rebuild after changing source or dependencies. Stop with Ctrl+C before backing up or restoring the database; see [storage and backup guidance](docs/architecture/runtime.md#data-directory-and-backup). Missing frontend output and invalid port/data settings produce startup errors. Keep the project and installed dependencies alongside the build.

## Limits to know

- This is a local, single-user app bound to loopback. It has no authentication or shared/hosted mode.
- Deletion is permanent. The dirty-tab warning protects ordinary navigation; unsaved text has no crash-recovery guarantee or version history.
- Import one UTF-8 `.md` file up to 256 KiB. Unsupported Markdown remains readable/copyable as original source and can be exported unchanged. Rich body edits may normalize Markdown syntax; supported structure and Mermaid payloads are preserved.
- Very large or complex diagrams may not preview; their source is retained. Rendering uses the browser's main thread. See [conversion and diagram limits](docs/architecture/editor.md).
- Retrying a create whose response was lost can produce a duplicate. A confirmed creation retries opening without another create.
- Installation and browser validation cover Windows 11 x64 with the versions above; other operating systems and screen readers have not been certified. SQLite requires its native binary to load.

## Project documentation

- [Product requirements](docs/requirements.md): goals and constraints.
- [Architecture](docs/architecture.md): design, decisions, and validation status.
- [Initial project roadmap](roadmaps/initial-project.md): release requirements, tasks, and evidence.
- [Agent instructions](AGENTS.md): repository conventions for coding agents.
