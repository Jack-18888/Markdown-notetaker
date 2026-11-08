# Markdown Note Taker

A local note-taking app for project notes, personal documentation, and technical writing. The planned first release combines nested folders, rich editing, Mermaid diagrams, and Markdown import/export, with raw Markdown saved in SQLite on your computer.

**Status:** Runnable scaffold with shared Markdown/API contracts, SQLite migrations, and persistence services. The React page checks the local API; note editing and resource routes are not implemented yet. Follow progress in the [initial project roadmap](roadmaps/initial-project.md).

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
```

The browser check starts and stops the development stack against an isolated temporary database; ports 5173 and 3001 must be free. Use npm run test:e2e so its launcher manages the temporary workspace. Chromium installation is only needed once per Playwright browser version. Unit/integration checks use isolated in-memory or temporary file-backed databases, including migration rollback, foreign keys, and reopen durability. Use npm run format to apply formatting.

## Built scaffold

```powershell
npm run build
npm start
```

Open http://127.0.0.1:3001 (or the configured PORT). The production process serves the built React page and API together, without Vite. Development uses watched source files; production uses dist output and must be rebuilt after changes. Production hardening and full operational acceptance remain in the roadmap. The app is intended for one person on their own computer.

## Project documentation

- [Product requirements](docs/requirements.md): goals and constraints.
- [Architecture](docs/architecture.md): design, decisions, and validation status.
- [Initial project roadmap](roadmaps/initial-project.md): release requirements, tasks, and evidence.
- [Agent instructions](AGENTS.md): repository conventions for coding agents.
