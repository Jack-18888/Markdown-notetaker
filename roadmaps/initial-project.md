# Initial project: design and implementation plan

**Release:** v1  
**Status:** Implementation started; T01 is complete. Remaining tasks await implementation.

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

Technical choices and their validation status belong to the [architecture decision register](../docs/architecture.md#decision-status-and-evidence). The summaries below link to the authoritative technical rules; this roadmap owns initial-release scope, acceptance criteria, and implementation work.

### Documents and persistence

SQLite stores the workspace hierarchy and canonical rich documents. Follow the architecture's [data model, revision, transaction, and migration rules](../docs/architecture.md#persistence-and-document-model).

### Editing and save flow

Autosave and recovery protect pending edits during navigation and failed requests. The architecture's [save lifecycle](../docs/architecture.md#save-lifecycle) owns the debounce interval, write ordering, snapshot acknowledgement, and conflict strategy.

### Markdown and diagram flow

Markdown provides explicit import/export, and diagrams retain editable source. Follow the architecture's [editor representation](../docs/architecture.md#rich-editing) and [conversion, rendering, and security rules](../docs/architecture.md#markdown-and-diagrams). [R6](#r6--import-and-export-markdown) owns this release's unsupported-content policy.

### Runtime and validation

Use the architecture's [local runtime design](../docs/architecture.md#local-runtime-and-operations) and [verification approach](../docs/architecture.md#design-validation-and-remaining-risks). Task-level checks below apply them to this release.

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

- Import an individual `.md` file as a new note in the selected folder or root, using the filename as its initial title.
- Export the current note with its latest saved content, including Mermaid fenced blocks.
- Preserve supported document structure and diagram source through export/reimport. Exact source whitespace is not guaranteed.
- Reject the entire import before creating a note if it contains tables, images (including reference-style images), frontmatter, raw HTML, or another recognized construct outside R3/R4's supported set. Explain which construct is unsupported; do not silently remove it, flatten it into supported formatting, or offer a lossy-import path in this release.
- Detect unsupported constructs in their Markdown context: examples inside inline or block code remain literal code and are allowed. Ordinary text remains text. Reject unsafe link destinations through the architecture's [conversion/security rules](../docs/architecture.md#markdown-and-diagrams) rather than silently removing them. Rejection leaves the source file and workspace unchanged; rich support for rejected constructs is outside this release.

**Acceptance criteria**

- Import a note containing the supported blocks and Mermaid, edit it, export it, and reimport it. The supported structure and diagram source remain equivalent. A failed import creates no partial note, and a canceled file picker changes nothing.
- Attempt imports containing each unsupported construct above, including mixed supported/unsupported content: each reports the reason and creates no note. Code examples containing the same syntax import and round-trip as code; ordinary text, escaped syntax, and horizontal rules are not misclassified as unsupported constructs. Cover unsafe links separately.

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

| ID          | Task                                     | Status | Direct dependencies      |
| ----------- | ---------------------------------------- | ------ | ------------------------ |
| [T01](#t01) | Workspaces and tooling                   | `done` | None                     |
| [T02](#t02) | Shared contracts                         | `todo` | [T01](#t01)              |
| [T03](#t03) | SQLite and migrations                    | `todo` | [T02](#t02)              |
| [T04](#t04) | Persistence services                     | `todo` | [T03](#t03)              |
| [T05](#t05) | Local REST API                           | `todo` | [T04](#t04)              |
| [T06](#t06) | Editor compatibility                     | `todo` | [T02](#t02)              |
| [T07](#t07) | Workspace navigation                     | `todo` | [T05](#t05)              |
| [T08](#t08) | Lifecycle controls                       | `todo` | [T07](#t07)              |
| [T09](#t09) | Rich editor and compatibility checkpoint | `todo` | [T06](#t06), [T07](#t07) |
| [T10](#t10) | Mermaid rendering                        | `todo` | [T09](#t09)              |
| [T11](#t11) | Autosave and conflicts                   | `todo` | [T08](#t08), [T09](#t09) |
| [T12](#t12) | Markdown import/export                   | `todo` | [T10](#t10), [T11](#t11) |
| [T13](#t13) | Accessibility and failure review         | `todo` | [T12](#t12)              |
| [T14](#t14) | Production execution                     | `todo` | [T05](#t05), [T12](#t12) |
| [T15](#t15) | Release acceptance and docs              | `todo` | [T13](#t13), [T14](#t14) |

### Editor and backend compatibility checkpoint

T03–T05 may finish against T02's initial contracts while T06 runs independently. Their completion does not make the integrated document API stable. T09 owns this checkpoint: run it once T05 and T06 are available, and pass it before marking T09 done. Record commands, results, tested document schema version, and fixture/test links under T09's Evidence; reference that record from T05 and T06.

After T06 finalizes or changes the schema, rerun these checks against the finalized contracts, even if the corresponding backend tasks are already done:

- **T02/shared validation:** Accept fixtures produced by every supported editor block/mark, including empty documents, nested content, and Mermaid; reject malformed documents, unknown nodes/marks, invalid attributes, and unsupported schema versions.
- **T03/T04 persistence:** Create and update those documents in isolated SQLite databases, close/reopen, and compare structure and Mermaid source. Rerun revision-conflict checks and verify rejected writes leave saved content unchanged.
- **T05/API:** Exercise real create/update/read requests for the same fixtures with Supertest and SQLite. Check invalid-document/version responses, conflicting updates, and applicable request-size boundaries without partial writes.
- **Integrated editor/conversion:** Load API-returned documents after reopening the database into the configured editor, then export/reimport supported content. Assert semantic equivalence and exact Mermaid source preservation; rerun browser/server typechecks.

If the change alters an existing persisted document format or database schema, add versioned migrations and rerun migration, rollback, and reopen checks using pre-change records; verify that existing content survives. A validator-only change must not silently strand previously valid saved documents. Never reset a database to pass the checkpoint.

Later changes to document contracts, editor extensions, or conversion adapters require the affected checkpoint checks to pass again before calling the integrated API stable. Record fresh evidence in the task making the change and link it from T09; T15 confirms evidence covers the release's final schema. Earlier task completion remains historical evidence.

<a id="t01"></a>

### T01 — Scaffold the TypeScript workspaces and tooling

Establish the backend, frontend, and shared package with reproducible root commands.

**Status:** `done` · **Priority:** high

**Depends on:** None  
**Requirements:** R1, R8

**Deliverables**

- apps/server
- apps/web
- packages/shared
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

Verified 2026-11-07 on Windows 11 x64, Node.js 24.18.0, npm 12.2.2.

- Installed dependencies and verified the final lockfile with a clean `npm ci --no-audit`. `npm ls --workspaces --depth=0` confirms both apps resolve the local shared package. Selected Express 5.3.0, React 19.3.1, Vite 8.3.6, and better-sqlite3 13.0.3; TypeScript 5.9.3 stays within TypeScript ESLint's supported range.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build` pass. Root typecheck also checks tooling configuration and browser test code. Shared code builds without Node/DOM ambient types; browser lint rejects server imports.
- `npm test`: 2 checks pass in [app.test.ts](../apps/server/src/app.test.ts), covering real Express health/JSON API 404 responses and the native SQLite binding with an isolated in-memory database. No user database is created or opened.
- `npx playwright install chromium` and `npm run test:e2e`: 1 Chromium check passes in [scaffold.spec.ts](../tests/e2e/scaffold.spec.ts). It starts root development (shared watcher, Express, Vite), loads React, reaches Express through the Vite proxy, and stops the process tree. The first attempt lacked the required Chromium version; installing it resolved the failure. This sandbox requires elevated process permissions for Windows browser/server cleanup.
- Production smoke: built the workspaces, launched `npm start` with `PORT=3002`, and used Chromium to verify the built page reaches its same-origin API, unknown API paths return JSON 404, and no browser runtime errors occur. Visually inspected 1440x1000 and 375x812 screenshots; no horizontal overflow. Stopped the smoke server afterward. This verifies scaffold startup only; T14 still owns production hardening and data operations.
- `npm audit --json`: 0 vulnerabilities after selecting patched minimatch 11.x through the root override. npm 12 script policy allows pinned esbuild setup and denies an unnecessary SQLite source build; the native load check passes after clean installation.
- `git check-ignore` confirms environment, data, database, build, dependency, browser-result, and screenshot paths are ignored; source files and the lockfile remain reviewable. Checked local documentation links/anchors, package scripts, ESM exports, and distinct development/production instructions in [README](../README.md).

Review follow-up, 2026-11-07: added independent root `dev:frontend` and `dev:backend` commands. Each builds shared code at startup; the backend also watches shared changes. Updated Playwright to launch the commands separately and wait for each service. `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run test:e2e` pass (1 Chromium check); `git diff --check` passes. README and architecture describe the two-terminal setup. The combined `dev` command remains available.

No T01 acceptance blockers remain. Note/API contracts, persistence behavior, editor packages, and release workflows remain in their owning later tasks.

<a id="t02"></a>

### T02 — Define shared API and document contracts

Establish initial shared API contracts and runtime validation; finalize editor-specific document validation with T06.

**Status:** `todo` · **Priority:** high  
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

- [ ] Both apps import identical contracts without server-only dependencies.
- [ ] Initial validation covers invalid names/parents, malformed envelopes, unsupported schema versions, and revision requests; T06 verifies the final editor node/mark schema.
- [ ] API contract documents paths, request/response shapes, and error codes.

**Verification**

- Run shared schema tests and workspace typecheck.

**Evidence**

No verification evidence recorded.

<a id="t03"></a>

### T03 — Implement SQLite initialization and migrations

Persist folders and canonical note documents safely across restarts.

**Status:** `todo` · **Priority:** high  
**Depends on:** T02  
**Requirements:** R8

**Deliverables**

- Database connection factory
- Versioned SQL migrations
- Temporary database test helper

**Implementation plan**

1. Choose and document a configurable local data directory and default; create it when missing and open SQLite through better-sqlite3. Exclude runtime data from Git.
2. Implement the architecture's [storage configuration and record model](../docs/architecture.md#persistence-and-document-model), including hierarchy indexes.
3. Build the migration runner following those rules. Keep database construction injectable for isolated tests.
4. Close connections during shutdown and report directory, lock, corruption, and migration errors without resetting existing data.

**Acceptance criteria**

- [ ] An empty directory initializes successfully and rerunning startup does not rerun applied migrations.
- [ ] Saved records survive closing/reopening the database; foreign keys reject invalid references.
- [ ] A failed migration rolls back and produces an actionable startup error without deleting existing records.

**Verification**

- Run temporary-database migration, foreign-key, rollback, and reopen tests.
- Smoke-check native SQLite installation on Windows.

**Evidence**

No verification evidence recorded.

<a id="t04"></a>

### T04 — Build folder and note persistence services

Implement atomic hierarchy operations and optimistic note updates independently of HTTP.

**Status:** `todo` · **Priority:** high  
**Depends on:** T03  
**Requirements:** R1, R5, R7, R8

**Deliverables**

- Folder and note repositories/services
- Persistence integration tests

**Implementation plan**

1. Implement metadata tree listing, note loading, creation with an empty document, rename/update, moving to a folder or root, and permanent deletion using parameterized SQL.
2. Implement hierarchy validation and mutations according to the architecture's [transaction and persistence rules](../docs/architecture.md#persistence-and-document-model).
3. Expose subtree deletion and the information needed for [R7's confirmation](#r7--delete-deliberately), without prescribing a new API metadata field here.
4. Apply those revision rules using T02's contract and return committed metadata for note updates.

**Acceptance criteria**

- [ ] Root notes and folders plus at least three nesting levels work correctly.
- [ ] Missing parents, invalid moves, and cyclic moves leave stored content unchanged.
- [ ] Subtree deletion preserves siblings and is all-or-nothing.
- [ ] Two updates using the same revision yield exactly one success and one conflict.

**Verification**

- Run repository integration tests against temporary SQLite databases.

**Evidence**

No verification evidence recorded.

<a id="t05"></a>

### T05 — Expose the validated local REST API

Connect shared contracts and persistence to Express with predictable failures and local browser protections. Integrated document compatibility remains provisional until the [T09 checkpoint](#editor-and-backend-compatibility-checkpoint) passes.

**Status:** `todo` · **Priority:** high  
**Depends on:** T04  
**Requirements:** R1, R5, R7, R8

**Deliverables**

- Express app factory and routes
- Error middleware
- API integration coverage

**Implementation plan**

1. Implement the T02 routes with shared body/parameter validation and service calls; keep app creation separate from listening so tests inject a database.
2. Map validation, missing-resource, hierarchy conflict, revision conflict, payload limit, and unexpected errors to the documented error envelope without leaking SQL or note content.
3. Listen only on loopback, validate Host, reject unapproved browser origins for writes, require JSON for mutation bodies, and avoid permissive CORS. Allow configured development and production origins.
4. Return health/startup errors in a usable form and shut down HTTP and SQLite cleanly.

**Acceptance criteria**

- [ ] Every documented endpoint passes success and failure integration scenarios.
- [ ] Tree responses omit document bodies; note detail loads them on demand.
- [ ] Malformed JSON, oversized bodies, hostile origins/hosts, cycles, and revision conflicts receive appropriate responses.
- [ ] Unhandled failures do not expose stack traces or stored document content to clients.

**Verification**

- Run Supertest integration tests with real temporary SQLite databases.
- Check loopback binding and origin behavior in development.

**Evidence**

No verification evidence recorded.

<a id="t06"></a>

### T06 — Prove editor and Markdown compatibility

Validate the riskiest editor integration before building the full writing interface.

**Status:** `todo` · **Priority:** high  
**Depends on:** T02  
**Requirements:** R3, R4, R6

**Deliverables**

- Editor extension configuration
- Mermaid node conversion hooks
- Markdown fixture tests

**Implementation plan**

1. Install compatible open-source Tiptap packages and @tiptap/markdown; define extensions for every supported block and mark.
2. Implement the Mermaid node and Markdown hooks using the architecture's [editor representation](../docs/architecture.md#rich-editing).
3. Finalize the shared runtime document schema against the editor extension set introduced here; adjust T02's initial contracts as needed and keep DOM-dependent editor code out of the server.
4. Test nested lists, tasks, links, inline/code fences, quotes, headings, and Mermaid through Markdown -> JSON -> Markdown -> JSON; disable arbitrary HTML interpretation and unsafe URLs.
5. Implement and test [R6's unsupported-content policy](#r6--import-and-export-markdown) before conversion can discard unsupported structure. Publish fixtures for the [backend compatibility checkpoint](#editor-and-backend-compatibility-checkpoint); identify affected contracts and migration needs for T09.

**Acceptance criteria**

- [ ] All supported content round-trips semantically using only open-source packages and no service credentials.
- [ ] Mermaid source survives JSON serialization and fenced Markdown conversion; T09 verifies real persistence through the checkpoint.
- [ ] Unsupported constructs are rejected according to R6, including mixed-content files; equivalent syntax inside code is preserved and unsafe links are rejected.
- [ ] Compatibility constraints, finalized document validation, and conversion limitations are documented before editor UI implementation.

**Verification**

- Run fixture-based conversion tests and shared document validation tests, including R6 rejection and literal-code cases. Record finalized schema details and affected backend checks for T09.

**Evidence**

No verification evidence recorded.

<a id="t07"></a>

### T07 — Create the workspace shell and folder navigation

Provide the main layout and metadata-driven navigation with usable empty and error states.

**Status:** `todo` · **Priority:** high  
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

- [ ] Root content and deep hierarchies display and navigate correctly.
- [ ] Selecting a note loads its document on demand without stale responses replacing the selected note.
- [ ] Loading/failure/empty states remain usable and controls have accessible names.
- [ ] The layout works at desktop and narrow browser widths without hiding the writing surface permanently.

**Verification**

- Run frontend state/component tests for navigation and fetch errors.
- Inspect layout and keyboard navigation in the browser.

**Evidence**

No verification evidence recorded.

<a id="t08"></a>

### T08 — Add note and folder lifecycle controls

Make all organization actions available through accessible sidebar controls.

**Status:** `todo` · **Priority:** high  
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

- [ ] Users can create, rename, move, and delete root/nested items with mouse and keyboard.
- [ ] Canceling deletion changes no data; confirmed folder deletion removes exactly its subtree.
- [ ] Failed operations show retryable errors and preserve existing tree/selection state.
- [ ] Moves update breadcrumbs and tree membership without duplicating items.

**Verification**

- Run browser lifecycle scenarios against the real API, including invalid moves and canceled deletion.

**Evidence**

No verification evidence recorded.

<a id="t09"></a>

### T09 — Build the rich block writing interface

Integrate the validated editor with a Notion-like editing workflow.

**Status:** `todo` · **Priority:** high  
**Depends on:** T06, T07  
**Requirements:** R3, R4, R5, R6, R8

**Deliverables**

- Tiptap editor UI
- Slash menu
- Formatting controls
- Integrated document compatibility evidence

**Implementation plan**

1. Render the canonical note document with all agreed blocks/marks, Markdown typing shortcuts, undo/redo, and a placeholder for an empty document.
2. Add an accessible slash menu for block insertion and contextual formatting/link controls, including Mermaid insertion.
3. Keep the title separate from the document body; reset editor history when switching notes and avoid replacing the document during active typing after saves.
4. Use clear heading/list/code styles and a spacious readable canvas; keep implementation details out of writing flows.
5. Run the [editor and backend compatibility checkpoint](#editor-and-backend-compatibility-checkpoint) against T06's finalized schema and resolve failures in shared contracts, persistence, or API validation before completing this task. Update relevant architecture decision statuses with scoped evidence.

**Acceptance criteria**

- [ ] Each agreed block/mark can be created, edited, removed, and restored with undo/redo.
- [ ] Slash menu selection works by keyboard and mouse and dismisses correctly.
- [ ] Switching notes does not carry text or undo history into another document.
- [ ] Only safe link protocols are accepted and malformed editor documents show a recoverable loading error.
- [ ] The compatibility checkpoint passes against the finalized schema, with evidence linked from T05 and T06.

**Verification**

- Run editor interaction tests and browser checks for shortcuts, menus, links, and note switching.
- Run and record the checkpoint's shared, real-database/API, editor/conversion, and type checks; include migration checks when required.

**Evidence**

No verification evidence recorded.

<a id="t10"></a>

### T10 — Render editable Mermaid diagram blocks

Show diagrams alongside their editable source without allowing invalid or stale renders to break notes.

**Status:** `todo` · **Priority:** high  
**Depends on:** T09  
**Requirements:** R4

**Deliverables**

- Mermaid React node view
- Render scheduling and error handling
- Diagram security fixtures

**Implementation plan**

1. Add source editing and preview to the Mermaid node view, with clear edit/preview controls and a source fallback.
2. Configure Mermaid according to the architecture's [rendering and security rules](../docs/architecture.md#markdown-and-diagrams).
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

No verification evidence recorded.

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

1. Implement the architecture's [save lifecycle](../docs/architecture.md#save-lifecycle) in the per-note coordinator.
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

1. Read a user-selected UTF-8 .md file in the browser, choose an import size limit compatible with the API limits established in T02, convert through the validated adapter, and create a new note in the selected folder/root.
2. Derive the title from the filename without its extension, choose a fallback for empty names, and apply the shared title rules. Report conversion/API failures without creating a partial note.
3. Flush pending changes before export, serialize the current document with Mermaid fenced blocks, and download using a safe .md filename.
4. Surface conversion rejections according to [R6](#r6--import-and-export-markdown), before any create request. Explain supported-format limitations concisely; do not upload assets or attempt exact source-whitespace preservation.

**Acceptance criteria**

- [ ] Import creates one correctly titled note in the chosen destination and opens it after successful save.
- [ ] Exported Markdown reimports with the same supported structure and Mermaid source.
- [ ] Canceled, oversized, invalid, or failed imports leave existing notes unchanged and show a useful message.
- [ ] Export contains the latest edits and fails visibly if its prerequisite save fails.
- [ ] Every R6 unsupported-content fixture is rejected before a create request, with a useful explanation; supported code examples containing the same syntax still import.

**Verification**

- Run fixture round-trip tests and Playwright file-upload/download scenarios, including all R6 rejection/literal-code cases, hostile HTML, and unsafe links. Verify rejected imports create no note through the real API/database.

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
5. Confirm compatibility-checkpoint evidence covers the final document schema. Update the architecture's [decision register](../docs/architecture.md#decision-status-and-evidence) with implementation/test links and scoped verification evidence; retain proposed or superseded statuses where appropriate.

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
