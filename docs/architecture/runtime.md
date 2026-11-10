# Local runtime and operations

In development, Vite serves the frontend and proxies API requests. In production, Express serves the built frontend and API from loopback. Unknown API paths must remain API errors rather than returning the frontend fallback page. The editor, Markdown conversion, and diagrams must not require runtime CDN or cloud access.

Because the app has no authentication, it binds to loopback, validates API Host headers and browser origins for writes, and supplies no permissive CORS headers. Public exposure would require a different security design.

API Host accepts only `127.0.0.1` or `localhost`, optionally with a valid port; forwarded headers do not grant access. Writes accept the exact HTTP origin matching Host. Development additionally permits `http://127.0.0.1:5173` and `http://localhost:5173`; production disables these additional origins. An absent Origin supports non-browser clients, while `Sec-Fetch-Site: cross-site` always rejects writes. API responses disable caching. Body-bearing routes use bounded JSON parsing; compressed bodies and other media types are rejected. Parser and unexpected failures use fixed public errors without request contents or internal diagnostics. See [transport middleware](../../apps/server/src/http/protection.ts) and [error handling](../../apps/server/src/http/errors.ts).

Store SQLite files in a configurable local data directory excluded from Git. Startup initializes the directory and applies migrations; shutdown closes the connection. Report inaccessible paths, locks, and migration failures without deleting existing content. Backup/restore instructions must account for SQLite sidecar files; the initial operational guidance will use a stopped server.

The scaffold targets Node.js 24 LTS and ESM throughout. Development runs separately with `npm run dev:backend` and `npm run dev:frontend`, or together with `npm run dev`. Vite serves 127.0.0.1:5173 and proxies /api to Express on 127.0.0.1:3001 by default. The root .env can override PORT for Express and its development proxy. See [README](../../README.md) for setup. Data initialization/migrations run before listening. All resource handlers are implemented; full production execution and backup/restore acceptance remain in the runtime tasks.

## Source imports and production builds

The private [contracts package](../../packages/contracts/package.json) exports TypeScript source directly. TypeScript/LSP, Vite, Vitest, and the backend's tsx loader all resolve the same source entry. Development and tests require no package compilation or extra watcher; normal app watchers observe imported contract source changes. See [the package decision](../decisions/0001-source-contracts.md).

TypeScript checks all workspaces with noEmit. Production frontend JavaScript comes from Vite. The backend uses esbuild to bundle its own source and the contracts source into apps/server/dist/index.js, with source maps. Other packages, including Express, Zod, and native SQLite, remain external dependencies. The explicit workspace alias makes contracts the exception to packages=external; npm start runs the built JavaScript without a TypeScript loader or a contracts/dist directory.

## Tooling choices

Vitest checks isolated contracts and logic, Supertest checks Express, and Playwright checks browser workflows. Persistence/API tasks must use temporary SQLite databases and reopen them when testing durability. ESLint, Prettier, and strict TypeScript provide quality checks; package manifests own the commands.

T01 selected TypeScript 5.9 because the TypeScript ESLint integration supports versions below 6.1. The root minimatch override selects the patched 11.x line for GHSA-g3hv-75wg-m249. npm 12 install-script rules allow pinned esbuild setup and deny an unnecessary better-sqlite3 source build. SQLite 13 ships native prebuilds, checked against Node.js 24.18.0. These choices do not validate persistence or the editor.

## Data directory and backup

The default database is data/workspace.sqlite under the repository root. DATA_DIR can override its directory through the root .env or process environment. Relative values always resolve from the repository root, including when npm launches development from apps/server; absolute values are used directly. Empty paths and null characters are rejected. Startup creates missing directories, applies migrations, and reports inaccessible paths, locks, corrupt files, or incompatible migrations without resetting data or printing underlying SQL/note content.

The HTTP/database lifecycle is managed by [startServer](../../apps/server/src/server.ts). Normal SIGINT/SIGTERM shutdown stops HTTP before closing SQLite; failed port binding closes the initialized database too. The connection factory accepts a directory/migration list for integration checks and a bounded busy-timeout override; normal startup uses 5000 ms.

For a backup, stop all backend processes and copy the entire configured data directory, keeping any SQLite WAL/SHM sidecars with the main file. Restore only while the backend is stopped, preserving the previous directory separately. The full operational walkthrough remains release work; reopen/upgrade durability is already tested on isolated data.

## Browser-test isolation

The root test:e2e script runs [a launcher](../../tests/e2e/run.mjs) that creates an OS temporary directory, passes it to the backend through Playwright configuration, and removes it after Playwright stops its servers. Direct playwright test calls are rejected without this harness directory, so browser checks cannot silently open the normal workspace. The native persistence tests similarly own their temporary directories and close all connections before cleanup.
