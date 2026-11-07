# Markdown Note Taker

A local note-taking app for project notes, personal documentation, and technical writing. The planned first release combines nested folders, rich editing, Mermaid diagrams, and Markdown import/export, with saved documents kept in SQLite on your computer.

**Status:** T01 scaffold implemented. The React page connects to a local Express health endpoint. Notes, editing, and persistence are not implemented yet. Follow progress in the [initial project roadmap](roadmaps/initial-project.md).

## Development setup

Use Node.js 24 LTS (24.18.0 or newer within the 24.x line) and npm 11 or 12. Installation and checks were verified on Windows 11 x64 with Node.js 24.18.0 and npm 12.2.2. Node 24 is a [supported LTS line](https://github.com/nodejs/Release). The native [better-sqlite3 dependency](https://github.com/WiseLibs/better-sqlite3) is installed now so runtime compatibility can be checked before persistence work.

Required npm 12 install-script rules are already recorded in package.json; no manual script approval is needed. The checks below verify that SQLite's Windows native binary loads.

From the repository root:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite serves React and proxies /api to Express at http://127.0.0.1:3001. Both processes bind to 127.0.0.1. Stop development with Ctrl+C.

Optionally copy .env.example to .env at the repository root and change PORT to select the Express port; Vite reads the same setting. Restart development after changing it. The frontend port is fixed at 5173 and startup fails if it is occupied. Environment files are ignored by Git except for .env.example. No database or data directory is created by the scaffold; persistence configuration belongs to T03.

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

The browser check starts and stops the development stack; ports 5173 and 3001 must be free. Chromium installation is only needed once per Playwright browser version. Unit checks exercise the Express health endpoint, API 404 handling, and the native SQLite binding using an in-memory database. Use npm run format to apply formatting.

## Built scaffold

```powershell
npm run build
npm start
```

Open http://127.0.0.1:3001 (or the configured PORT). The production process serves the built React page and API together, without Vite. Development uses watched source files; production uses dist output and must be rebuilt after changes. This is a scaffold smoke path; production hardening and persistence operations are scheduled in T14. The app is intended for one person on their own computer.

## Project documentation

- [Product requirements](docs/requirements.md): goals and constraints.
- [Architecture](docs/architecture.md): design, decisions, and validation status.
- [Initial project roadmap](roadmaps/initial-project.md): release requirements, tasks, and evidence.
- [Agent instructions](AGENTS.md): repository conventions for coding agents.
