# Initial project: design and implementation plan

**Release:** v1  
**Status:** T01-T09 are implemented in the PR stack, awaiting review. The editor/backend compatibility checkpoint passes for the documented rich subset. T10's Mermaid previews are in progress; autosave/recovery and import/export remain T11-T12.

Local single-user note workspace with nested folders, a rich block editor, SQLite persistence, Mermaid, and Markdown import/export.

This document defines the initial release's design, detailed requirements, and implementation tasks. It does not describe completed functionality. Product-level goals live in [product requirements](../docs/requirements.md); the [architecture](../docs/architecture.md) explains the proposed system in greater depth.

## Goal and scope

One person using a local workspace on their own computer.

- Node.js, TypeScript, Express, and SQLite backend; React frontend.
- Store documents in SQLite with Markdown import/export; do not automatically maintain .md files on disk.
- Desktop browsers are the primary target; a responsive layout is not a separate mobile app.

**Outside this release:** Authentication, Multiple users, Collaboration, Public hosting, Cloud sync, Search, Tags, Uploads, Trash, Note version history, Filesystem mirroring, Separate Markdown source mode.

## Proposed design

Use a React workspace for folder navigation, rich editing, Markdown conversion, and diagram previews. A local Express API owns hierarchy rules, revision checks, and SQLite persistence. Portable shared TypeScript schemas keep browser and server contracts aligned without exposing server dependencies to the browser.

Technical choices and their validation status belong to the [architecture decision register](../docs/decisions/README.md). The summaries below link to the authoritative technical rules; this roadmap owns initial-release scope, acceptance criteria, and implementation work.

### Documents and persistence

SQLite stores the workspace hierarchy and complete raw Markdown source. The frontend retains rich editing and owns conversion and rendering. Follow the architecture's [data model and migration rules](../docs/architecture/persistence.md) and the [workspace service guide](../apps/server/src/workspace/README.md).

### Editing and save flow

Autosave and recovery protect pending edits during navigation and failed requests. The architecture's [save lifecycle](../docs/architecture/editor.md#save-lifecycle) owns the debounce interval, write ordering, snapshot acknowledgement, and conflict strategy.

### Markdown and diagram flow

Markdown provides explicit import/export, and diagrams retain editable source. Follow the architecture's [editor representation](../docs/architecture/editor.md#rich-editing) and [conversion, rendering, and security rules](../docs/architecture/editor.md#markdown-and-diagrams). [R6](#r6--import-and-export-markdown) owns this release's unsupported-content policy.

### Runtime and validation

Use the architecture's [local runtime design](../docs/architecture/runtime.md) and [verification approach](../docs/architecture.md#design-validation-and-remaining-risks). Task-level checks below apply them to this release.

Validate editor/Markdown compatibility early. Establish exact API contracts, input limits, runtime versions, ports, and data paths during their owning tasks. The tasks below specify where each choice is made and verified; this document does not invent working setup commands.

## Release requirements

### R1 — Organize notes and folders

- Create notes and folders at the workspace root or inside a folder.
- Rename items and move them to another folder or back to the root.
- Reject moves into missing destinations, into the folder itself, or into any of its descendants.

**Acceptance criteria**

- Create at least three nested folder levels, move a note between levels and back to root, and rename it. A rejected cyclic move leaves the hierarchy and note content unchanged.

### R2 — Navigate the workspace

- Show a collapsible folder sidebar, the active note, and its breadcrumb path.
- Distinguish loading, empty workspace/folder, and failed-load states; offer retry for a failed load.
- Make core navigation and menus operable by keyboard with visible focus. Allow the sidebar to collapse at narrow browser widths.

**Acceptance criteria**

- Select a note through the folder tree and verify its content and breadcrumb. Navigate and activate controls by keyboard. On a narrow viewport, both folder navigation and the writing area remain reachable. A failed load displays an error rather than a blank editor.

### R3 — Write in a rich editor

- Edit paragraphs, headings, bold, italic, strikethrough, links, ordered and unordered lists, checklists, blockquotes, inline code, code blocks, and horizontal rules.
- Provide Markdown typing shortcuts, a slash menu, formatting controls, and undo/redo.
- Edit the note title separately from its body. Keep one note's content and undo history from affecting another note.

**Acceptance criteria**

- Create, edit, undo, and redo the supported content types. Save and reopen the note with its structure intact. Switching notes never inserts the previous note's text or makes its history available in the new note.

### R4 — Include Mermaid diagrams

- Insert a diagram block, edit its Mermaid source, and preview the diagram inside the note.
- Preserve the source when syntax is invalid and display an inline error without breaking the rest of the editor.

**Acceptance criteria**

- Render a flowchart and a sequence diagram, including multiple diagrams in one note. Introduce a syntax error, correct it, and recover the preview without losing the source. Editing another block remains possible throughout.

### R5 — Save without silent data loss

- Autosave edits and show whether changes are pending, saving, saved, or failed.
- Retain pending content on a failed save and offer retry. Save pending changes before switching notes; if saving fails, keep the current note open.
- Detect competing edits from another tab instead of silently overwriting them. Offer explicit reload or saving the local content as a new note.

**Acceptance criteria**

- Type while a save is in progress, then switch notes; reopening shows the latest edits. Simulate a failed save and retry without retyping. Edit the same saved revision in two tabs: the later conflicting write preserves the local text and offers both recovery choices.

### R6 — Import and export Markdown

- Import an individual UTF-8 .md file as a new note in the selected folder or root, using the filename as its initial title.
- Store the entire Markdown source verbatim, including whitespace, line endings, unsupported syntax, and Mermaid fences. Export the latest saved source without another conversion pass.
- Rich editing supports R3/R4. If a note contains constructs the rich editor cannot preserve, keep its raw source and show a safe read-only preview/source fallback with an explanation. Never save a reduced conversion or silently remove content.
- Keep raw HTML and unsafe URLs inert in previews and editor views. New link controls reject unsafe protocols. Code examples remain literal code. Rich body edits must preserve all supported structure and exact Mermaid source; untouched notes, title changes, and moves retain the original source bytes.

**Acceptance criteria**

- Import and export an untouched note containing Markdown, tables, images, frontmatter, HTML source, and Mermaid: the downloaded source matches the imported UTF-8 content exactly. Unsupported rich constructs produce a usable fallback and remain saved.
- Edit supported content through the rich editor, save, reopen, and verify equivalent structure and exact Mermaid source. Failed or canceled imports create no partial note. Hostile HTML/links/diagrams cannot execute scripts.

### R7 — Delete deliberately

- Confirm permanent note and folder deletion.
- Explain that deleting a folder also deletes its contents. Delete the entire subtree together or leave it unchanged on failure.
- Do not provide trash or undo after a committed deletion.

**Acceptance criteria**

- Cancel a deletion and verify no change. Confirm deletion of a nested folder containing notes; its descendants disappear while sibling notes and folders remain. A failed deletion does not leave a partially deleted subtree.

### R8 — Keep saved data locally

- Retain saved content and folder structure across browser reload and server restart.
- Run as one local workspace without accounts or external services.
- Warn on normal tab closure while edits are unsaved. Recovery of unsaved edits after an abrupt browser exit or crash is not guaranteed.

**Acceptance criteria**

- Restart the server with the same database and reopen saved notes, including formatted content and Mermaid source. Verify the dirty-tab warning and that a clean tab does not warn. Saving, editing, and diagram rendering require no external account or service.

### Cross-cutting acceptance

- Imported Markdown, links, and diagrams must not execute scripts.
- Core create, edit, move, delete, import, and export flows must remain keyboard-operable.
- Failed operations must report their outcome without silently discarding pending edits or replacing existing saved content.

## Implementation tasks

Keep task IDs stable. Each task's requirement IDs refer to the release requirements above. Status values are `todo`, `in_progress`, `blocked`, and `done`; priorities are `high` and `medium`.

Follow dependency order. Mark a task done only after its acceptance criteria pass and record actual verification results or blockers under Evidence. Task completion records release history; it is not a guarantee of current behavior after later changes.

Implementation steps are guidance within the product requirements and proposed design. Document and test choices made during implementation. Complete task-level checks as work lands; the final release task confirms the integrated result.

### Task index

Task sections are authoritative for status and dependencies. Update this navigation table whenever those fields change; acceptance criteria and evidence stay in the sections.

| ID          | Task                                     | Status        | Direct dependencies      |
| ----------- | ---------------------------------------- | ------------- | ------------------------ |
| [T01](#t01) | Workspaces and tooling                   | `done`        | None                     |
| [T02](#t02) | Shared contracts                         | `done`        | [T01](#t01)              |
| [T03](#t03) | SQLite and migrations                    | `done`        | [T02](#t02)              |
| [T04](#t04) | Persistence services                     | `done`        | [T03](#t03)              |
| [T05](#t05) | Local REST API                           | `done`        | [T04](#t04)              |
| [T06](#t06) | Editor compatibility                     | `done`        | [T02](#t02)              |
| [T07](#t07) | Workspace navigation                     | `done`        | [T05](#t05)              |
| [T08](#t08) | Lifecycle controls                       | `done`        | [T07](#t07)              |
| [T09](#t09) | Rich editor and compatibility checkpoint | `done`        | [T06](#t06), [T07](#t07) |
| [T10](#t10) | Mermaid rendering                        | `in_progress` | [T09](#t09)              |
| [T11](#t11) | Autosave and conflicts                   | `todo`        | [T08](#t08), [T09](#t09) |
| [T12](#t12) | Markdown import/export                   | `todo`        | [T10](#t10), [T11](#t11) |
| [T13](#t13) | Accessibility and failure review         | `todo`        | [T12](#t12)              |
| [T14](#t14) | Production execution                     | `todo`        | [T05](#t05), [T12](#t12) |
| [T15](#t15) | Release acceptance and docs              | `todo`        | [T13](#t13), [T14](#t14) |

### Editor and backend compatibility checkpoint

T09 owns this checkpoint once T05 and T06 are available. Record commands, results, and fixture/test links under T09's Evidence; reference that record from T05 and T06. The backend contract is a Markdown string, independent of editor-specific trees.

- **Shared contracts:** Accept empty and arbitrary well-formed Markdown strings verbatim; reject non-string, malformed Unicode, and oversized content. Verify UTF-8 boundaries independently of HTTP JSON encoding.
- **Persistence:** Create/update raw source in temporary SQLite databases and compare content byte-for-byte after reopening, including line endings, whitespace, Mermaid, and unsupported rich constructs. Verify revision conflicts and rejected writes leave saved content unchanged.
- **API:** Exercise the same strings through real create/update/read requests. Verify body limits, invalid input, and conflict responses without partial writes.
- **Frontend:** Load API content into the rich editor and serialize supported edits back to Markdown. Verify semantic equivalence, exact Mermaid source, unchanged-source preservation, and safe read-only fallback for unsupported content. Run browser/server typechecks and rendering security checks.

Persisted format changes require versioned migrations and upgrade/rollback/reopen checks against pre-change notes. Never reset a database or discard content to pass the checkpoint. Later changes to contracts, editor extensions, conversion, or rendering require the affected checks again. Earlier task evidence remains historical.

<a id="t01"></a>

### T01 — Scaffold the TypeScript workspaces and tooling

Establish the backend, frontend, and shared package with reproducible root commands.

**Status:** `done` · **Priority:** high

**Depends on:** None  
**Requirements:** R1, R8

**Deliverables**

- apps/server
- apps/web
- packages/contracts
- root scripts and lockfile
- environment example and ignore rules

**Implementation plan**

1. Preserve starter package metadata where appropriate; configure npm workspaces and a consistent module strategy with strict TypeScript.
2. Select a supported Node.js LTS compatible with better-sqlite3 and record it in engines and verified setup documentation. Install the proposed tooling from docs/architecture.md, checking compatibility rather than assuming versions.
3. Provide root dev, typecheck, lint, format:check, test, test:e2e, build, and start scripts; do not leave the placeholder test command.
4. Configure Vite API proxying, server loopback defaults, and ignored data/build/cache paths. Add verified setup instructions to README and create docs/development.md only if detailed development instructions warrant a separate guide.

**Acceptance criteria**

- [x] Dependencies install on the target Windows environment and shared types resolve from both apps.
- [x] Root dev starts both apps; typecheck, lint, format:check, and build succeed against the scaffold.
- [x] No real database, secret, or generated artifact is tracked; production and development configuration are distinct and documented.

**Verification**

- Run install, root development smoke check, typecheck, lint, format:check, and build.
- Inspect ignored paths and workspace dependency graph.

**Evidence**

Historical T01 verification, 2026-11-07, Windows 11 x64, Node.js 24.18.0, npm 12.2.2. The compiled shared-package workflow recorded here is replaced by T02 review follow-up; current source links point to the renamed contracts package.

- Installed dependencies and verified the final lockfile with a clean `npm ci --no-audit`. `npm ls --workspaces --depth=0` confirms both apps resolve the local shared package. Selected Express 5.3.0, React 19.3.1, Vite 8.3.6, and better-sqlite3 13.0.3; TypeScript 5.9.3 stays within TypeScript ESLint's supported range.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build` pass. Root typecheck also checks tooling configuration and browser test code. Shared code builds without Node/DOM ambient types; browser lint rejects server imports.
- `npm test`: 2 checks pass in [app.test.ts](../apps/server/src/__test__/app.test.ts), covering real Express health/JSON API 404 responses and the native SQLite binding with an isolated in-memory database. No user database is created or opened.
- `npx playwright install chromium` and `npm run test:e2e`: 1 Chromium check passes in [scaffold.spec.ts](../tests/e2e/scaffold.spec.ts). It starts root development (shared watcher, Express, Vite), loads React, reaches Express through the Vite proxy, and stops the process tree. The first attempt lacked the required Chromium version; installing it resolved the failure. This sandbox requires elevated process permissions for Windows browser/server cleanup.
- Production smoke: built the workspaces, launched `npm start` with `PORT=3002`, and used Chromium to verify the built page reaches its same-origin API, unknown API paths return JSON 404, and no browser runtime errors occur. Visually inspected 1440x1000 and 375x812 screenshots; no horizontal overflow. Stopped the smoke server afterward. This verifies scaffold startup only; T14 still owns production hardening and data operations.
- `npm audit --json`: 0 vulnerabilities after selecting patched minimatch 11.x through the root override. npm 12 script policy allows pinned esbuild setup and denies an unnecessary SQLite source build; the native load check passes after clean installation.
- `git check-ignore` confirms environment, data, database, build, dependency, browser-result, and screenshot paths are ignored; source files and the lockfile remain reviewable. Checked local documentation links/anchors, package scripts, ESM exports, and distinct development/production instructions in [README](../README.md).

Review follow-up, 2026-11-07: added independent root `dev:frontend` and `dev:backend` commands. Each builds shared code at startup; the backend also watches shared changes. Updated Playwright to launch the commands separately and wait for each service. `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run test:e2e` pass (1 Chromium check); `git diff --check` passes. README and architecture describe the two-terminal setup. The combined `dev` command remains available.

No T01 acceptance blockers remain. Note/API contracts, persistence behavior, editor packages, and release workflows remain in their owning later tasks.

<a id="t02"></a>

### T02 — Define shared API and document contracts

Historical initial contracts were introduced here. The paragraph/JSON storage contract is superseded by raw Markdown in T04; see [the storage decision](../docs/decisions/0003-raw-markdown.md).

**Status:** `done` · **Priority:** high

**Depends on:** T01  
**Requirements:** R1, R3, R5

**Deliverables**

- Initial shared runtime schemas and inferred types
- Documented API contracts alongside implementation

**Implementation plan**

1. Define initial folder metadata, note metadata/detail, document envelope, schema version, revision, and consistent errors as shared runtime schemas and inferred types.
2. Choose and document resource identifiers, name validation, root representation, and duplicate-name behavior. Use the architecture's data model; test boundary cases rather than treating earlier suggested limits as requirements.
3. Define exact routes and request/response contracts for tree metadata, note detail, and note/folder creation, updates, moves, and deletion. Keep response metadata separate from document bodies.
4. Specify revision-based update conflicts and errors for invalid input, missing resources, and hierarchy conflicts; keep contracts authoritative in shared schemas and document their public behavior with implementation.
5. Choose compatible payload limits and initial document validation. Coordinate with T06 before treating the editor node/mark schema as final; document how unsupported schema versions are rejected safely.

**Acceptance criteria**

- [x] Both apps import identical contracts without server-only dependencies.
- [x] Initial validation covers invalid names/parents, malformed envelopes, unsupported schema versions, and revision requests; T06 verifies the final editor node/mark schema.
- [x] API contract documents paths, request/response shapes, and error codes.

**Verification**

- Run shared schema tests and workspace typecheck.

**Evidence**

Verified 2026-11-07 on Windows 11 x64, Node.js 24.18.0, npm 12.2.2. Reviewed and committed as 33705ec.

- Added Zod 4.6.7 as the contracts package's sole runtime dependency. [Contract schemas](../packages/contracts/src/index.ts) define resource IDs/names/roots, folder and note metadata/detail, provisional version-1 documents, request revisions, strict errors, limits, and all initial route descriptors. [API contracts](../docs/api.md) document exact shapes, routes, statuses, duplicate-name policy, and service responsibilities.
- Both apps consume the same health schema and route descriptor. Express validates health and fallback error envelopes; React validates the actual health response. The contracts workspace typechecks without Node/DOM ambient types, and `npm ls --workspace @markdown-note-taker/contracts --depth=0` confirms only Zod is required at runtime. Resource handlers and persistence remain in T03-T05.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build` pass. Root typecheck includes contract tests. TypeScript, tests, and development resolve contracts source directly, so there is no package prebuild or stale compiled-contract output. Production builds bundle that source into each app.
- `npm test`: 99 checks pass, including 75 [contract checks](../packages/contracts/src/__test__/contracts.test.ts), 22 historical document-schema checks (now replaced by [Markdown checks](../packages/contracts/src/__test__/markdown.test.ts)), and 2 [real Express/native SQLite smoke checks](../apps/server/src/__test__/app.test.ts). Covered Unicode/name/ID boundaries, explicit null roots, timestamps, empty/invalid patches, missing/coerced/unsafe revisions, metadata/body separation, fixed conflict/error envelopes, malformed documents/versions, unknown nodes/attributes/marks, inclusive UTF-8/JSON escaping limits, complexity limits, and cyclic/non-JSON inputs. SQLite uses only an isolated in-memory database.
- `npm run test:e2e`: 1 Chromium check passes through the separate frontend/backend commands and Vite proxy with the shared runtime validator loaded in the browser. The test cleans up its server processes. Browser/server builds pass without importing persistence into the browser/contracts package.
- Checked all local documentation links/anchors, all route paths against the registry, and all 3 JSON examples in API documentation against their real schemas. Reviewed manifest/lockfile dependency consistency and ignored generated output; `git diff --check` passes.

Review revision, 2026-11-07:

- Renamed the package/directory to `@markdown-note-taker/contracts` / `packages/contracts`, updated all consumers and lockfile entries, and exported TypeScript source directly. Removed package compilation/watch steps. TypeScript performs no-emit checks; Vite builds browser JavaScript and esbuild bundles contracts into the production server while leaving other npm dependencies external.
- `npm ci --offline --no-audit` passes with the renamed workspace. Typecheck, lint, all 81 tests, both app builds, formatting, and the Chromium proxy check pass. Production `npm start` serves the built page/API on an isolated port without tsx or a contracts/dist directory.
- Verified TypeScript language-service go-to-definition reaches `packages/contracts/src/api.ts`. Verified an actual contracts edit reloads the backend and restoration reloads it again. Verified the combined `npm run dev` command and Vite fetching an updated contracts source module after a source edit. Temporary probes were restored and test servers stopped.
- Added module/schema/helper comments explaining note revisions versus format versions, parent references, input units, document work limits, validation stages, resource mutations, and safe error responses. Renamed the internal limit-check helper and JSON preflight schema to make their roles explicit.
- Split architecture into a short [overview](../docs/architecture.md), focused [topic pages](../docs/architecture/), and [decision records](../docs/decisions/README.md). Feature/release plans remain in roadmaps. Documented why paragraphs contain text runs and why a virtual root remains appropriate for this single-user release; ownership remains a separate future design concern. No persisted format change is involved.
- Checked all documentation links/anchors, route paths, all 3 API JSON examples against the source schemas, manifest/lockfile consistency, and the absence of generated contract output. The review revisions are included in the T02 change.

Limit-check verification: concise walk/serialization comments and the `DocumentValidationReason` enum explain the preflight rules. The helper is private; 22 public `documentEnvelopeSchema` tests use `parse` for valid documents and `safeParse` with enum-reason assertions for failures. Covered inclusive byte/depth/value boundaries, UTF-8/escaping, key sizes, sibling containers, sparse arrays, non-JSON values, custom serializers, and cycles. Duplicate contract tests were consolidated. Typecheck, lint, all 99 tests, both builds, formatting, and diff checks pass; diagnostic strings remain unchanged. The previous Chromium and API documentation checks cover unchanged runtime behavior.

These results record the original contracts. T04 replaces the provisional paragraph envelope and JSON limits with raw Markdown text; T06/T09 verify frontend conversion without adding editor-node persistence.

<a id="t03"></a>

### T03 — Implement SQLite initialization and migrations

Persist folders and canonical note documents safely across restarts.

**Status:** `done` · **Priority:** high

**Depends on:** T02  
**Requirements:** R8

**Deliverables**

- Database connection factory
- Versioned SQL migrations
- Temporary database test helper

**Implementation plan**

1. Choose and document a configurable local data directory and default; create it when missing and open SQLite through better-sqlite3. Exclude runtime data from Git.
2. Implement the architecture's [storage configuration and record model](../docs/architecture/persistence.md), including hierarchy indexes.
3. Build the migration runner following those rules. Keep database construction injectable for isolated tests.
4. Close connections during shutdown and report directory, lock, corruption, and migration errors without resetting existing data.

**Acceptance criteria**

- [x] An empty directory initializes successfully and rerunning startup does not rerun applied migrations.
- [x] Saved records survive closing/reopening the database; foreign keys reject invalid references.
- [x] A failed migration rolls back and produces an actionable startup error without deleting existing records.

**Verification**

- Run temporary-database migration, foreign-key, rollback, and reopen tests.
- Smoke-check native SQLite installation on Windows.

**Evidence**

Verified 2026-11-07 on Windows 11 x64, Node.js 24.18.0, npm 12.2.2. Reviewed and committed as `08d64bf`.

- [openDatabase](../apps/server/src/database/open.ts) initializes data/workspace.sqlite by default, accepts DATA_DIR through [configuration](../apps/server/src/config.ts), and sets foreign_keys=ON, journal_mode=WAL, synchronous=FULL, and a 5000 ms busy timeout. Relative directories resolve from the repository root in source and bundled execution. [.env.example](../.env.example) and [README](../README.md) document verified startup/storage configuration.
- [Versioned SQL](../apps/server/src/database/migrations/001-workspace.ts) creates strict folders/notes tables, parent-reference indexes, JSON/revision checks, and a migration journal. The [runner](../apps/server/src/database/migrations.ts) verifies version/name/SQL checksums and user_version, then applies all pending migrations in one immediate transaction. It rejects changed/newer/inconsistent history without reset or downgrade.
- `npm test`: all 137 checks pass, including 38 new file-backed/lifecycle checks. [Connection tests](../apps/server/src/database/__test__/open.test.ts) verify actual settings, indexes, foreign keys, saved metadata/JSON after reopen, lock recovery, corruption preservation, invalid configuration, and unavailable paths. Path failures use blocking files/directories, not modified Windows ACLs. [Migration tests](../apps/server/src/database/__test__/migrations.test.ts) verify idempotence, successful upgrade of populated data, full pending-batch rollback, clean first-batch rollback/retry, unchanged existing notes, and incompatible journals/versions. [Runtime tests](../apps/server/src/__test__/server.test.ts) exercise real HTTP startup, shutdown, and occupied ports.
- [Temporary-workspace helpers](../apps/server/src/__test__/temporary-workspace.ts) close owned connections and remove only their verified OS temporary directories. No normal workspace database is used by tests. Browser checks now use [an isolated launcher](../tests/e2e/run.mjs), which supplies a temporary DATA_DIR and cleans it after server teardown; direct Playwright test calls without the harness directory are rejected.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build` pass. `npm run test:e2e`: 1 Chromium check passes through React, the Vite proxy, and the newly initialized database-backed startup.
- CLI smoke: started source from apps/server and `npm start` from the root using the same project-relative temporary DATA_DIR. The second startup preserved saved fixture JSON/revision and migration checksums/timestamps; production HTML/assets and API 404 responses worked. A blocked data path exited with code 1 before listening and preserved the blocking file. Temporary child processes/data were cleaned up.
- Checked documentation links/anchors, API JSON examples, manifest/lockfile consistency, ignored database/sidecar/build paths, and `git diff --check`. SQLite remains server-only; the browser bundle is unchanged.

These checks record storage schema 1. T04 adds migration 2 for raw Markdown; resource routes and the rich editor compatibility checkpoint remain in their owning tasks. Startup reports sanitized directory/lock/corruption/migration failures and never deletes or resets existing saved data.

<a id="t04"></a>

### T04 — Build folder and note persistence services

Implement atomic hierarchy operations and optimistic note updates independently of HTTP.

**Status:** `done` · **Priority:** high

**Depends on:** T03  
**Requirements:** R1, R5, R7, R8

**Deliverables**

- Folder and note repositories/services
- Persistence integration tests

**Implementation plan**

1. Implement metadata tree listing, note loading, creation with an empty document, rename/update, moving to a folder or root, and permanent deletion using parameterized SQL.
2. Implement hierarchy validation and mutations according to the [workspace service rules](../apps/server/src/workspace/README.md#hierarchy-and-revisions).
3. Expose subtree deletion and the information needed for [R7's confirmation](#r7--delete-deliberately), without prescribing a new API metadata field here.
4. Apply those revision rules using T02's contract and return committed metadata for note updates.

**Acceptance criteria**

- [x] Root notes and folders plus at least three nesting levels work correctly.
- [x] Missing parents, invalid moves, and cyclic moves leave stored content unchanged.
- [x] Subtree deletion preserves siblings and is all-or-nothing.
- [x] Two updates using the same revision yield exactly one success and one conflict.

**Verification**

- Run repository integration tests against temporary SQLite databases.

**Evidence**

Verified 2026-11-07 and rechecked 2026-11-08 on Windows 11 x64, Node.js 24.18.0, npm 12.2.2. Reviewed and committed as database migration, Markdown contracts, transactional services, and server persistence boundary changes.

- Implementation and maintenance rules live in the [workspace README](../apps/server/src/workspace/README.md). Raw Markdown is canonical; the rich editor remains frontend work. Editor JSON envelopes, per-document schema versions, and node/depth/value validation are removed from the current API.
- Migration 1 remains unchanged. [Migration 2](../apps/server/src/database/migrations/002-markdown.ts) unwraps supported legacy paragraph/text records into raw text, preserving IDs, hierarchy, revisions, and timestamps. Text runs concatenate verbatim; paragraph boundaries become blank lines. An unsupported version/node/attribute, malformed Unicode, or failed conversion rolls back the whole batch and leaves the original database usable with schema 1.
- All 147 tests pass, including [Markdown boundaries](../packages/contracts/src/__test__/markdown.test.ts), [legacy migration/rollback checks](../apps/server/src/database/migrations/__test__/002-markdown.test.ts), [service persistence](../apps/server/src/workspace/__test__/service.test.ts), and [workspace lifecycle](../apps/server/src/workspace/__test__/open.test.ts). Tests cover empty content, CRLF, BOM, Unicode, NUL, Markdown syntax, unchanged metadata, byte-for-byte reopen, stale revisions, hierarchy checks, and rollback after SQL failures. Failure in a later pending migration also restores the original schema-1 notes and journal after conversion.
- Invalid content is rejected before SQL writes; reads return stored text. The byte cap measures raw UTF-8 rather than JSON escaping. Resource handlers remain in T05. Import/export and rich conversion remain in T06/T09/T12.
- Typecheck, lint, formatting, and builds pass. Documentation links/anchors, route descriptors, API examples, and manifest/lockfile consistency pass. Isolated source/production startup checks preserve raw Markdown and migration history; the compiled production server upgrades legacy notes without changing revisions. Production assets/API responses and invalid-path startup checks pass. The original migration is unchanged, and no database or generated artifacts are tracked.

No T04 acceptance blockers remain. HTTP resource handlers, transport protections, and API integration checks remain in T05. Frontend workflows remain in their later tasks.

<a id="t05"></a>

### T05 — Expose the validated local REST API

Connect shared contracts and persistence to Express with predictable failures and local browser protections. Integrated editor/Markdown compatibility remains provisional until the [T09 checkpoint](#editor-and-backend-compatibility-checkpoint) passes.

**Status:** `done` · **Priority:** high

**Depends on:** T04  
**Requirements:** R1, R5, R7, R8

**Deliverables**

- Express app factory and routes
- Error middleware
- API integration coverage

**Implementation plan**

1. Implement the T02 routes with shared body/parameter validation and service calls; keep app creation separate from listening so tests inject a workspace service backed by isolated SQLite.
2. Map validation, missing-resource, hierarchy conflict, revision conflict, payload limit, and unexpected errors to the documented error envelope without leaking SQL or note content.
3. Listen only on loopback, validate Host, reject unapproved browser origins for writes, require JSON for mutation bodies, and avoid permissive CORS. Allow configured development and production origins.
4. Return health/startup errors in a usable form and shut down HTTP and SQLite cleanly.

**Acceptance criteria**

- [x] Every documented endpoint passes success and failure integration scenarios.
- [x] Tree responses omit document bodies; note detail loads them on demand.
- [x] Malformed JSON, oversized bodies, hostile origins/hosts, cycles, and revision conflicts receive appropriate responses.
- [x] Unhandled failures do not expose stack traces or stored document content to clients.

**Verification**

- Run Supertest integration tests with real temporary SQLite databases.
- Check loopback binding and origin behavior in development.

**Evidence**

Verified 2026-11-09 on Windows 11 x64, Node.js 24.18.0, npm 12.2.2. Delivered above the persistence stack as transport, read API, folder mutations, note mutations, and runtime verification PRs, pending review.

- [HTTP adapters](../apps/server/src/http/workspace.ts) implement every shared route through an injected workspace service. [Transport tests](../apps/server/src/http/__test__/protection.test.ts) cover loopback Host validation, development/production origins, cross-site writes, JSON media/encoding, inclusive request-byte limits, and fixed public errors. API responses disable caching; no permissive CORS headers are added.
- Real temporary SQLite tests cover [metadata-only reads](../apps/server/src/http/__test__/workspace.test.ts), [folder hierarchy and rollback](../apps/server/src/http/__test__/folders.test.ts), and [note source/revisions](../apps/server/src/http/__test__/notes.test.ts). Raw Markdown survives HTTP create/rename/move/reopen byte-for-byte. Competing HTTP saves yield one success and one conflict; stale deletion and rejected writes preserve saved content. Forced subtree-delete failure leaves the tree and notes intact.
- `npm run typecheck`, `npm run lint`, `npm test` (211 tests), `npm run format:check`, and `npm run build` pass. `npm run test:e2e` passes both Chromium checks, including [browser writes through Vite](../tests/e2e/workspace-api.spec.ts). [Server lifecycle tests](../apps/server/src/__test__/server.test.ts) verify loopback binding, startup failure, occupied ports, and production-mode HTTP persistence after restart.
- A compiled production smoke check launched the built entry with plain Node and an isolated temporary data directory. Static assets, JSON API fallback, Host/origin rejection, note writes, restart durability, stale revision conflicts, and deletion pass. Its processes and temporary data were removed. Local documentation link targets and all three API JSON examples validate; `git diff --check` passes. No database format or dependency changes were needed.

The integrated [T09 editor/backend checkpoint](#t09) now passes for the documented rich subset. These T05 checks validate raw Markdown transport and persistence; [T06 evidence](#t06) records frontend conversion coverage. Diagram previews remain T10. Full production backup/restore acceptance remains in T14.

<a id="t06"></a>

### T06 — Prove editor and Markdown compatibility

Validate the riskiest editor integration before building the full writing interface.

**Status:** `done` · **Priority:** high

**Depends on:** T02  
**Requirements:** R3, R4, R6

**Deliverables**

- Editor extension configuration
- Mermaid node conversion hooks
- Markdown fixture tests

**Implementation plan**

1. Install compatible open-source Tiptap packages and @tiptap/markdown; define extensions for every supported block and mark.
2. Implement the Mermaid node and Markdown hooks using the architecture's [editor representation](../docs/architecture/editor.md#rich-editing).
3. Keep editor nodes/marks and conversion in the frontend. The shared backend contract remains raw Markdown text; do not add an editor-tree envelope to storage or API payloads.
4. Test Markdown -> frontend editor state -> Markdown for every supported feature, with exact Mermaid source and original-source retention when unedited. Keep arbitrary HTML and unsafe URLs inert.
5. Implement [R6's preservation/fallback policy](#r6--import-and-export-markdown) before conversion can discard source. Publish supported, unsupported, and hostile fixtures for the [compatibility checkpoint](#editor-and-backend-compatibility-checkpoint).

**Acceptance criteria**

- [x] All supported content round-trips semantically using only open-source packages and no service credentials.
- [x] Mermaid source survives frontend editor conversion and raw Markdown persistence; T09 verifies the integrated checkpoint.
- [x] Unsupported rich constructs retain their raw Markdown and use the safe fallback from R6; code examples remain literal and unsafe links cannot execute.
- [x] Frontend conversion constraints, source retention, fallback behavior, and rendering limits are documented before editor UI implementation.

**Verification**

- Run frontend conversion fixtures and shared Markdown string tests, including R6 source-preservation/fallback and literal-code cases. Record affected checkpoint checks for T09.

**Evidence**

Verified 2026-11-09 on Windows 11 x64, Node.js 24.18.0, npm 12.2.2. Delivered in five PRs above the API stack: extensions/dependencies, source policy, source retention, fallback view, and browser/compatibility verification. Awaiting review.

- Pinned matching open-source Tiptap 3.33.0 packages, Marked 18.2.0, and Happy DOM 21.0.4 for tests. No service credentials, database format, backend, or shared contract changes. Installation reports zero vulnerabilities.
- [Supported fixtures](../apps/web/src/editor/__test__/fixtures.ts) cover paragraphs, all six heading levels, marks, links, nested ordered/unordered lists, nested checklists, blockquotes, literal code, horizontal rules, hard breaks, multiple Mermaid blocks, and invalid diagram syntax. Every fixture passes both [schema conversion](../apps/web/src/editor/__test__/extensions.test.ts) and the [guarded public boundary](../apps/web/src/editor/__test__/markdown.test.ts), including another body edit and reload.
- [Source policy fixtures](../apps/web/src/editor/__test__/source-policy.test.ts) verify unsupported/hostile content and bounded conversion. Unsupported source never enters an editable document. Untouched supported notes retain their original bytes. Other body edits preserve exact Mermaid source, including CRLF/CR, whitespace, trailing blank lines, and embedded backticks. Edited documents must pass schema/link validation and structural round-trip checks; failed conversion retains the current document and source.
- The [fallback component](../apps/web/src/editor/SourceFallback.tsx) displays read-only selectable source with an explanation. [DOM tests](../apps/web/src/editor/__test__/source-fallback.test.ts) and [Chromium checks](../tests/e2e/editor-compatibility.spec.ts) verify literal hostile HTML/URLs, keyboard focus, and narrow-screen containment. Visually inspected the 375px-wide source view. [Editor architecture](../docs/architecture/editor.md) records supported/fallback forms, limits, interfaces, and pending rendering work.
- `npm run typecheck`, `npm run lint`, `npm test` (304 tests, including 93 frontend checks), `npm run format:check`, and `npm run build` pass. `npm run test:e2e` passes all four Chromium checks. A real mounted editor edits source, saves it through the actual API/SQLite stack, and reloads it after browser navigation with exact Mermaid payloads. Vite prebundles editor dependencies to prevent first-import reloads. Root tooling typechecks include DOM APIs for browser evaluation; portable contracts keep their own DOM-free typecheck.

T06 compatibility is validated for the documented subset and limits. The integrated writing UI and full [T09 editor/backend checkpoint](#t09) now pass, using [T05 API evidence](#t05) and these T06 fixtures for lower-layer coverage. Actual Mermaid previews, autosave/recovery, and file import/export remain T10-T12.

<a id="t07"></a>

### T07 — Create the workspace shell and folder navigation

Provide the main layout and metadata-driven navigation with usable empty and error states.

**Status:** `done` · **Priority:** high

**Depends on:** T05  
**Requirements:** R2

**Deliverables**

- React workspace layout
- Typed API client
- Folder tree and breadcrumbs

**Implementation plan**

1. Build a typed API client with consistent error handling and a separate data-access layer for tree and note requests.
2. Implement a collapsible hierarchical sidebar, workspace-root entry, breadcrumbs, active-note state, editable title area, and writing canvas with restrained styling.
3. Choose a predictable tree ordering and use stable IDs for selection and expansion. Document the chosen ordering as implementation behavior; handle missing/deleted selections gracefully.
4. Add loading, empty-workspace, empty-folder, fetch-error/retry states and a collapsible sidebar on narrow screens; support keyboard navigation and visible focus.

**Acceptance criteria**

- [x] Root content and deep hierarchies display and navigate correctly.
- [x] Selecting a note loads its document on demand without stale responses replacing the selected note.
- [x] Loading/failure/empty states remain usable and controls have accessible names.
- [x] The layout works at desktop and narrow browser widths without hiding the writing surface permanently.

**Verification**

- Run frontend state/component tests for navigation and fetch errors.
- Inspect layout and keyboard navigation in the browser.

**Evidence**

Verified 2026-11-09 on Windows 11 x64, Node.js 24.18.0, npm 12.2.2. Delivered in six PRs above the editor stack: client/index, navigation components, layout styles, app integration, title saves, and final browser/state verification. Awaiting review.

- The [workspace client](../apps/web/src/workspace/api.ts) validates shared success/error contracts and note identity. The [hierarchy index](../apps/web/src/workspace/tree.ts) rejects duplicate IDs, missing parents, and cycles. [Navigation architecture](../docs/architecture/navigation.md) records stable ID-based selection/expansion, folder-first numeric label ordering, breadcrumbs, request lifetimes, and title-save behavior.
- The [app shell](../apps/web/src/App.tsx) supplies root/deep-folder navigation, distinct empty states, loading/error/retry views, a collapsible sidebar, breadcrumbs, and on-demand note detail. The [note content view](../apps/web/src/workspace/NoteContent.tsx) uses T06's conversion boundary and source fallback; opening notes does not write their bodies. T09 subsequently adds explicit body editing. [Request lifecycle tests](../apps/web/src/workspace/__test__/useLoad.test.ts) verify cancellation and ignoring late completions even when the transport ignores abort.
- [Deep navigation checks](../tests/e2e/navigation.spec.ts) use real API/SQLite fixtures for three folder levels, note selection, breadcrumbs, exact saved source, and deleted-selection recovery. [State/browser checks](../tests/e2e/navigation-states.spec.ts) cover keyboard operation, 375px layout, empty folders/workspace, loading/failure/retry, rapid selection, and safe original-source fallback. Controlled failed/empty responses isolate UI states; persisted-note workflows use the real API. Reopening folders after scrolling a long note now brings navigation into view and focuses its first control.
- [Title-save browser checks](../tests/e2e/title.spec.ts) verify explicit save/discard, shared name validation, revision checks, in-flight newer edits, failed-save retry, another tab's conflict, protected navigation/refresh, and the dirty-tab warning handler. Title patches omit content and preserve the original source byte-for-byte. Metadata updates do not remount the reading view or reset a newer draft. General body editing/autosave/recovery remain T09/T11.
- `npm run typecheck`, `npm run lint`, `npm test` (321 tests, including 17 workspace client/model/component/lifecycle checks), `npm run format:check`, and `npm run build` pass. `npm run test:e2e` passes all ten Chromium checks using at most four workers. The Markdown parser and lazy preview compile to separate browser chunks without the prior chunk-size warning. All local documentation link targets and three API JSON examples validate; `git diff --check` passes.
- A compiled production server with isolated temporary SQLite data passed real Chromium navigation, lazy preview/parser loading, title saves, narrow-screen containment, and restart durability with zero browser errors. Visually inspected desktop and narrow production reading views. Smoke processes and temporary data were removed. No server, migration, dependency, or user-data changes were needed.

T08 still owns create/rename/move/delete sidebar controls and confirmation dialogs. T09/T10 own the writing UI and diagram previews; T11 owns autosave and full recovery. The integrated editor/backend checkpoint remains pending those writing controls rather than being implied by the read-only navigation checks.

<a id="t08"></a>

### T08 — Add note and folder lifecycle controls

Make all organization actions available through accessible sidebar controls.

**Status:** `done` · **Priority:** high

**Depends on:** T07  
**Requirements:** R1, R2, R7

**Deliverables**

- Create/rename dialogs
- Destination picker
- Permanent deletion confirmation

**Implementation plan**

1. Provide contextual create-note/create-folder and rename actions at root and folder levels, with inline validation and pending states.
2. Use a folder picker for moves; exclude invalid folder destinations and surface server-side errors without changing selection incorrectly.
3. Confirm note deletion and folder subtree deletion with item counts and explicit permanent wording; refresh metadata only after committed changes.
4. Choose the parent folder/empty state after active-note deletion, preserve valid selection during moves, and prevent double submission.

**Acceptance criteria**

- [x] Users can create, rename, move, and delete root/nested items with mouse and keyboard.
- [x] Canceling deletion changes no data; confirmed folder deletion removes exactly its subtree.
- [x] Failed operations show retryable errors and preserve existing tree/selection state.
- [x] Moves update breadcrumbs and tree membership without duplicating items.

**Verification**

- Run browser lifecycle scenarios against the real API, including invalid moves and canceled deletion.

**Evidence**

- [Lifecycle clients/helpers](../apps/web/src/workspace/lifecycle.ts) and [navigation architecture](../docs/architecture/navigation.md) document validated mutations, subtree counts, destination exclusions, loaded note revisions, and metadata-only writes. Client/model/operation tests cover success/error contracts, duplicate destination labels, concurrent submission, and refresh-only retry after a known commit.
- [Create/rename browser checks](../tests/e2e/lifecycle-names.spec.ts) cover root/nested creation, contextual parents, validation, keyboard traversal/cancellation, title-draft protection, and exactly one create when a committed write's metadata refresh fails. [Recovery checks](../tests/e2e/lifecycle-recovery.spec.ts) verify retained input after failure, revision-conflicting rename without overwrite, and keyboard move/delete dialogs at 375px.
- [Move checks](../tests/e2e/lifecycle-moves.spec.ts) preserve note identity and exact CRLF/Mermaid source through nested and root moves. Folder moves exclude their subtree, retain selection, and reveal new breadcrumbs. A real second-client hierarchy change causes server rejection without changing the source parent or selected destination.
- [Deletion checks](../tests/e2e/lifecycle-delete.spec.ts) verify Cancel receives initial focus, keyboard cancellation performs no write, counts and permanent wording are visible, confirmed removal deletes only the subtree, and sibling source remains intact. Note deletion rejects a newer revision until reopened. Failed deletion leaves data intact; pending confirmation blocks Escape/double submission and sends one DELETE. Committed deletion selects the parent/root.
- `npm run typecheck`, `npm run lint`, `npm test` (329 tests), `npm run format:check`, and `npm run build` pass. `npm run test:e2e` passes all 19 Chromium checks against isolated temporary SQLite data with at most four workers. Local documentation link targets and API JSON examples validate; `git diff --check` passes.
- The compiled production server passed real Chromium nested create, rename, root/nested move, note/folder deletion, and restart durability. Retained source, revision, selection, and subtree removal matched the API after restart, with zero browser errors. Desktop controls and the narrow permanent-deletion dialog were visually inspected. Smoke processes and temporary data were removed. No server, migration, dependency, or user-data changes were needed.

T09/T10 still own body editing and diagram previews; T11 owns general autosave and conflict recovery. Lifecycle dialogs protect current title drafts and loaded revisions. A failed network response can leave an unknown server outcome because the API has no idempotency keys; only acknowledged commits use refresh-only retry.

<a id="t09"></a>

### T09 — Build the rich block writing interface

Integrate the validated editor with a Notion-like editing workflow.

**Status:** `done` · **Priority:** high

**Depends on:** T06, T07  
**Requirements:** R3, R4, R5, R6, R8

**Deliverables**

- Tiptap editor UI
- Slash menu
- Formatting controls
- Integrated document compatibility evidence

**Implementation plan**

1. Load raw Markdown into the rich editor with all agreed blocks/marks, typing shortcuts, undo/redo, and a blank-note placeholder. Retain the original source until the body is edited.
2. Add an accessible slash menu for block insertion and contextual formatting/link controls, including Mermaid insertion.
3. Keep the title separate from the document body; reset editor history when switching notes and avoid replacing the document during active typing after saves.
4. Use clear heading/list/code styles and a spacious readable canvas; keep implementation details out of writing flows.
5. Run the [editor and backend compatibility checkpoint](#editor-and-backend-compatibility-checkpoint) against T06's frontend Markdown conversion and resolve failures in shared contracts, persistence, or API validation before completing this task. Update relevant architecture decision statuses with scoped evidence.

**Acceptance criteria**

- [x] Each agreed block/mark can be created, edited, removed, and restored with undo/redo.
- [x] Slash menu selection works by keyboard and mouse and dismisses correctly.
- [x] Switching notes does not carry text or undo history into another document.
- [x] Unsafe links and HTML remain inert; unsupported rich content retains its saved source and shows a usable read-only fallback.
- [x] The Markdown/editor compatibility checkpoint passes, with evidence linked from T05 and T06.

**Verification**

- Run editor interaction tests and browser checks for shortcuts, menus, links, and note switching.
- Run and record the checkpoint's shared, real-database/API, editor/conversion, and type checks; include migration checks when required.

**Evidence**

- The [shared command layer](../apps/web/src/editor/commands.ts) supplies block insertion, formatting/history actions, search labels, and validated link changes for the toolbar/slash UI. [24 real-editor checks](../apps/web/src/editor/__test__/commands.test.ts) pass for supported blocks/marks, single-update mutations, guarded serialization, undo/redo, slash-query replacement, rejected nested diagrams/ranges, read-only protection, and safe link changes.
- The command layer now drives the [toolbar](../apps/web/src/editor/EditorToolbar.tsx), [validated link dialog](../apps/web/src/editor/LinkDialog.tsx), [slash menu](../apps/web/src/editor/SlashMenu.tsx), and [selected-note canvas](../apps/web/src/editor/NoteEditor.tsx). Explicit body saves retain in-flight edits and coordinate revisions with title saves; dirty writing blocks navigation and lifecycle actions. [Body-save browser checks](../tests/e2e/writing-save.spec.ts) cover ordering, source retention, retry, and conflicts against real API/temporary SQLite data. T11 still owns autosave, navigation flushing, and conflict recovery.
- Verified 2026-11-10, Windows 11 x64 / Node 24.18.0 / npm 12.2.2. Delivered above the shared-command PR as four focused PRs: toolbar/links, slash insertion, canvas/explicit saves, and workflow/checkpoint verification. Awaiting review.
- [Control browser checks](../tests/e2e/writing-controls.spec.ts) cover keyboard/pointer slash filtering and dismissal, formatting and typing shortcuts, link validation/removal/cancel/focus restoration, note-local history, literal hostile fallback, and 375px layout containment. The slash menu stays beside the caret within the viewport. Visually inspected the narrow writing canvas.
- [Conversion recovery](../tests/e2e/writing-conversion.spec.ts) verifies that an unsupported nested-diagram edit sends no write, retains writing and saved source, and recovers through undo. [Frontend boundary fixtures](../apps/web/src/editor/__test__/markdown.test.ts), [command tests](../apps/web/src/editor/__test__/commands.test.ts), and the [mounted toolbar test](../apps/web/src/editor/__test__/toolbar.test.ts) cover all supported blocks/marks, reversible edits, schema/link guards, and untouched-source retention.
- **Compatibility checkpoint:** [Raw string/UTF-8 validation](../packages/contracts/src/__test__/markdown.test.ts), [API validation/conflicts](../apps/server/src/http/__test__/notes.test.ts), and [18 shared-fixture HTTP/reopen checks](../apps/server/src/http/__test__/editor-checkpoint.test.ts) pass. The same supported editor fixtures plus empty, CRLF Mermaid, unsupported, and hostile source survive create/update/read/reopen byte-for-byte; stale writes leave the acknowledged revision unchanged. [Browser save checks](../tests/e2e/writing-save.spec.ts) and [browser conversion checks](../tests/e2e/editor-compatibility.spec.ts) prove supported edits through the actual editor/API/SQLite path with exact Mermaid payloads. No persisted format changed; existing migration upgrade/rollback/reopen tests still pass.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (373 tests), and `npm run build` pass. `npm run test:e2e` passes all 24 checks in the full run; the subsequently added `npm run test:e2e -- writing-conversion.spec.ts` passes its additional check. Local documentation links and JSON examples validate; `git diff --check` passes. Diagram source editing/previews remain T10; autosave, navigation flushing, and explicit conflict recovery remain T11. Conflict responses currently preserve writing and report the failure.

<a id="t10"></a>

### T10 — Render editable Mermaid diagram blocks

Show diagrams alongside their editable source without allowing invalid or stale renders to break notes.

**Status:** `in_progress` · **Priority:** high  
**Depends on:** T09  
**Requirements:** R4

**Deliverables**

- Mermaid React node view
- Render scheduling and error handling
- Diagram security fixtures

**Implementation plan**

1. Add source editing and preview to the Mermaid node view, with clear edit/preview controls and a source fallback.
2. Configure Mermaid according to the architecture's [rendering and security rules](../docs/architecture/editor.md#markdown-and-diagrams).
3. Implement the prescribed asynchronous render lifecycle in the node view, including unmount cleanup.
4. Add inline empty/invalid-source states, render debouncing, and the prescribed complexity limits.

**Acceptance criteria**

- [ ] Valid flowchart and sequence diagrams render, including multiple diagrams in one note.
- [ ] Invalid source stays editable and does not crash the editor or create global error overlays.
- [ ] Rapid edits and note switches cannot display an outdated diagram in another block.
- [ ] Untrusted diagrams cannot execute scripts or weaken renderer configuration.

**Verification**

- Run browser tests for valid/invalid diagrams, multiple blocks, stale renders, and hostile diagram fixtures.

**Evidence**

- The [renderer boundary](../apps/web/src/editor/diagram-renderer.ts) pins Mermaid 12.3.0 and DOMPurify 3.4.17, runs with strict security, disables HTML labels/configuration overrides, bounds preview work, serializes asynchronous calls, and cleans temporary DOM. [Policy tests](../apps/web/src/editor/__test__/diagram-policy.test.ts) cover limits and configuration rejection. [Real Chromium checks](../tests/e2e/diagram-renderer.spec.ts) pass for flowcharts, sequence diagrams, invalid/blocked/canceled work, static SVG sanitization, and cleanup. Source editing, integrated previews, and remaining T10 acceptance are still pending.

- The optional [node view](../apps/web/src/editor/mermaid-node-view.tsx) now connects [source editing and debounced previews](../apps/web/src/editor/MermaidView.tsx) to the writing canvas. [Integrated editing checks](../tests/e2e/mermaid-editing.spec.ts) pass for multiple diagrams, invalid source, editing surrounding text, exact untouched diagram payloads through saves/reopen, source undo/redo, removal, and undo restoration. Stale/security coverage and the full T10 verification remain the final slice.

<a id="t11"></a>

### T11 — Implement autosave, navigation guards, and conflict recovery

Prevent dropped or overwritten edits during ordinary navigation, failures, and competing tab writes.

**Status:** `todo` · **Priority:** high  
**Depends on:** T08, T09  
**Requirements:** R5, R8

**Deliverables**

- Per-note save coordinator
- Save status and retry UI
- Revision conflict recovery UI

**Implementation plan**

1. Implement the architecture's [save lifecycle](../docs/architecture/editor.md#save-lifecycle) in the per-note coordinator.
2. Track saved, unsaved, saving, and failed/conflict states. A completed request only marks its own snapshot saved, never newer pending edits.
3. Flush changes before selection changes or operations that could discard the active document. Failed flushes keep the document active with retry; prevent an old save from reverting a rename or move.
4. On the API's revision-conflict response retain local content and offer explicit discard-and-reload or save-as-new-note recovery. Warn before discarding local content.
5. Register beforeunload while dirty; document that abrupt tab/browser failure can still lose unsaved changes. Do not add draft recovery/history beyond the agreed scope.

**Acceptance criteria**

- [ ] Typing batches into debounced writes and never produces overlapping writes for the same note.
- [ ] Edits made during a save remain dirty until their own successful save; switching flushes the latest snapshot.
- [ ] Network/server failures retain text and allow retry; a failed navigation flush does not switch notes.
- [ ] Competing tabs cannot silently overwrite each other and both conflict recovery choices behave as labeled.
- [ ] Dirty tab closure triggers a warning; clean tabs do not warn.

**Verification**

- Run deterministic save-coordinator tests for timing, in-flight edits, stale results, and retry.
- Run browser tests with delayed/failed responses and two tabs against one database.

**Evidence**

No verification evidence recorded.

<a id="t12"></a>

### T12 — Add Markdown file import and export

Make supported note content portable through individual .md files.

**Status:** `todo` · **Priority:** high  
**Depends on:** T10, T11  
**Requirements:** R6

**Deliverables**

- Markdown file picker/import flow
- Current-note Markdown download
- Round-trip acceptance fixtures

**Implementation plan**

1. Read a user-selected UTF-8 .md file in the browser, apply the shared import size/Unicode limits and create a new note with the entire raw source in the selected folder/root.
2. Derive the title from the filename without its extension, choose a fallback for empty names, and apply the shared title rules. Report input/API failures without creating a partial note.
3. Flush pending rich edits before export, then download the latest saved Markdown string verbatim using a safe .md filename.
4. Preserve unsupported source according to [R6](#r6--import-and-export-markdown) and show a safe rich-editor fallback without rewriting it. Do not upload assets; retain source whitespace and line endings for untouched notes.

**Acceptance criteria**

- [ ] Import creates one correctly titled note in the chosen destination and opens it after successful save.
- [ ] Untouched Markdown exports byte-for-byte; supported rich edits reimport with equivalent structure and exact Mermaid source.
- [ ] Canceled, oversized, invalid, or failed imports leave existing notes unchanged and show a useful message.
- [ ] Export contains the latest edits and fails visibly if its prerequisite save fails.
- [ ] Every R6 unsupported-content fixture imports and exports without source loss, with a useful rich-editor fallback; hostile source cannot execute.

**Verification**

- Run fixture and Playwright import/export scenarios for exact source preservation, supported rich edits, fallback, literal code, hostile HTML, unsafe links, and invalid/failed imports. Verify failures create no partial note through the real API/database.

**Evidence**

No verification evidence recorded.

<a id="t13"></a>

### T13 — Complete accessible interaction and failure-state review

Make the integrated workflow usable across keyboard, small screens, empty content, and recoverable errors.

**Status:** `todo` · **Priority:** medium  
**Depends on:** T12  
**Requirements:** R2, R3, R4, R5

**Deliverables**

- Accessible dialogs/menus/tree interactions
- Responsive layout refinements
- Unified error and status presentation

**Implementation plan**

1. Review focus order, dialog focus trapping/return, tree/menu keyboard controls, accessible names, and announced save/error status.
2. Verify empty workspace/folder/note, missing resources, offline API, invalid documents, and long titles/deep nesting have clear outcomes.
3. Refine readable typography and overflow for code/diagrams, narrow-screen sidebar behavior, and non-color-only status indications.
4. Fix integration gaps without adding search, drag-and-drop, themes, or other unplanned product features.

**Acceptance criteria**

- [ ] Core create/edit/move/delete/import/export flows are keyboard-operable with visible focus.
- [ ] Dialogs restore focus and save/error changes are available to assistive technology.
- [ ] Long content and diagrams do not break the page layout; narrow-screen navigation remains reachable.
- [ ] Failures and empty states offer an appropriate next action without discarding local content.

**Verification**

- Run browser accessibility checks and manual keyboard walkthrough at desktop and narrow widths.

**Evidence**

No verification evidence recorded.

<a id="t14"></a>

### T14 — Package and verify local production execution

Serve the built app from Express and retain notes across application restarts.

**Status:** `todo` · **Priority:** high  
**Depends on:** T05, T12  
**Requirements:** R8

**Deliverables**

- Production static serving
- Startup/config validation
- Production persistence smoke scenario

**Implementation plan**

1. Build shared code, server, and Vite output in dependency order; serve frontend assets and navigation fallbacks from Express without swallowing unknown API routes.
2. Make npm start run the built server on loopback with validated ports/data-directory configuration; show actionable errors for missing build assets or inaccessible databases.
3. Ensure asset/API URLs work without Vite and no runtime CDN/cloud dependency is required for the editor or Mermaid.
4. Exercise graceful shutdown, restart, migrations, and reopen using the same isolated data directory.

**Acceptance criteria**

- [ ] npm run build followed by npm start serves the app without the development server.
- [ ] Saved folder structure, documents, and Mermaid source survive server restart.
- [ ] Unknown API routes return API errors instead of the frontend HTML.
- [ ] The production service remains loopback-only and fails cleanly on invalid configuration.

**Verification**

- Run the production build and a browser smoke test against the built server.
- Restart with the same temporary database and verify persisted notes.

**Evidence**

No verification evidence recorded.

<a id="t15"></a>

### T15 — Run the release acceptance suite and finalize documentation

Verify the agreed release end to end and replace planning-only setup information with accurate instructions.

**Status:** `todo` · **Priority:** high  
**Depends on:** T13, T14  
**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8

**Deliverables**

- Release acceptance results
- Verified README setup/deployment instructions and updated design documentation
- Documented limitations and task evidence

**Implementation plan**

1. Run the API integration and Playwright suites against isolated real databases, including hierarchy mutations, restart persistence, supported Markdown blocks, Mermaid, failures, and conflicting tabs.
2. Run typecheck, lint, format:check, and production build; resolve failures in scope and record actual outcomes rather than inferring success.
3. Document verified installation and local deployment in README: Node version, commands, configuration, database location, and stopped-server backup/restore. Add docs/development.md or docs/deployment.md only if the actual instructions outgrow a short README section; link rather than duplicate command catalogs.
4. Document permanent deletion, no crash recovery guarantee for unsaved text, Markdown limitations, loopback-only operation, and native SQLite setup requirements. Update task statuses only when their criteria pass.
5. Confirm compatibility-checkpoint evidence covers the final Markdown contract and frontend conversion. Update the architecture's [decision register](../docs/decisions/README.md) with implementation/test links and scoped verification evidence; retain proposed or superseded statuses where appropriate.

**Acceptance criteria**

- [ ] A clean checkout can follow the verified setup/deployment documentation linked from README to install, develop, build, and run locally.
- [ ] All required quality checks and release scenarios pass with recorded evidence.
- [ ] No task is marked done with unmet acceptance criteria or unreported blockers.
- [ ] README describes actual capabilities and tested startup instructions; architecture matches implementation, product requirements remain high-level and this roadmap retains initial-release scope, and AGENTS remains durable workflow guidance.

**Verification**

- Run npm run typecheck, npm run lint, npm run format:check, npm test, npm run test:e2e, and npm run build.
- Perform a clean-install/setup walkthrough and review tracked files for database/artifact leakage.

**Evidence**

No verification evidence recorded.
