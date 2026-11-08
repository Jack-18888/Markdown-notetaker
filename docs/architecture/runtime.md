# Local runtime and operations

In development, Vite serves the frontend and proxies API requests. In production, Express serves the built frontend and API from loopback. Unknown API paths must remain API errors rather than returning the frontend fallback page. The editor, Markdown conversion, and diagrams must not require runtime CDN or cloud access.

Because the app has no authentication, keep it bound to loopback, validate browser origins for writes, and avoid permissive CORS. Public exposure would require a different security design.

Store SQLite files in a configurable local data directory excluded from Git. Startup initializes the directory and applies migrations; shutdown closes the connection. Report inaccessible paths, locks, and migration failures without deleting existing content. Backup/restore instructions must account for SQLite sidecar files; the initial operational guidance will use a stopped server.

The scaffold targets Node.js 24 LTS and ESM throughout. Development runs separately with `npm run dev:backend` and `npm run dev:frontend`, or together with `npm run dev`. Vite serves 127.0.0.1:5173 and proxies /api to Express on 127.0.0.1:3001 by default. The root .env can override PORT for Express and its development proxy. See [README](../../README.md) for setup. Data paths, migrations, browser write protections, and operational hardening remain in T03, T05, and T14.

## Source imports and production builds

The private [contracts package](../../packages/contracts/package.json) exports TypeScript source directly. TypeScript/LSP, Vite, Vitest, and the backend's tsx loader all resolve the same source entry. Development and tests require no package compilation or extra watcher; normal app watchers observe imported contract source changes. See [the package decision](../decisions/0001-source-contracts.md).

TypeScript checks all workspaces with noEmit. Production frontend JavaScript comes from Vite. The backend uses esbuild to bundle its own source and the contracts source into apps/server/dist/index.js, with source maps. Other packages, including Express, Zod, and native SQLite, remain external dependencies. The explicit workspace alias makes contracts the exception to packages=external; npm start runs the built JavaScript without a TypeScript loader or a contracts/dist directory.

## Tooling choices

Vitest checks isolated contracts and logic, Supertest checks Express, and Playwright checks browser workflows. Persistence/API tasks must use temporary SQLite databases and reopen them when testing durability. ESLint, Prettier, and strict TypeScript provide quality checks; package manifests own the commands.

T01 selected TypeScript 5.9 because the TypeScript ESLint integration supports versions below 6.1. The root minimatch override selects the patched 11.x line for GHSA-g3hv-75wg-m249. npm 12 install-script rules allow pinned esbuild setup and deny an unnecessary better-sqlite3 source build. SQLite 13 ships native prebuilds, checked against Node.js 24.18.0. These choices do not validate persistence or the editor.
