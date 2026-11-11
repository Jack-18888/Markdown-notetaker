# Workspace persistence

This module owns application access to saved notes and folders. All application note and folder mutations go through `WorkspaceService`.

## Public entry point

Application startup calls [openWorkspace](open.ts), passes its `service` to application code, and calls `close()` during shutdown. The handle exposes no database connection. Public options are limited to the data directory and busy timeout.

Database settings, including foreign-key enforcement, are initialized by [openDatabase](../database/open.ts). The service relies on that setup instead of checking the same settings again.

[ESLint import restrictions](../../../../eslint.config.js) keep direct SQLite, database, migration, and repository access inside persistence internals. New features must use service methods for persistence.

## Validate writes, trust reads

Create and update requests are checked against the [contracts](../../../../packages/contracts/src/index.ts) before writing. Content is a raw Markdown string, checked for well-formed Unicode and its UTF-8 byte cap. The backend does not parse Markdown, validate editor nodes, or normalize source. All rendering and rich editor conversion belong to the frontend.

The content field contains the entire Markdown source. Omitted content on creation defaults to an empty string; an explicit empty string clears a note. Omitted patch fields retain their saved values. Successful creates and updates return committed records.

The portable [parseContract helper](../../../../packages/contracts/src/validation.ts) parses unknown input using a caller-supplied failure policy. The workspace [validation adapter](validation.ts) owns error classification: Markdown content byte-limit failures map to `PAYLOAD_TOO_LARGE`; other invalid input maps to `INVALID_INPUT`. Services and HTTP parameter adapters use this policy directly, without a separate note-validation wrapper.

On updates, omitted or explicitly `undefined` fields retain their saved values. A `null` parent/folder moves the resource to the workspace root. Names, titles, and content reject `null`; an empty content string clears the body. Strict request schemas reject client-supplied IDs, saved revisions, timestamps, and other unknown fields.

Reads return the saved content string directly, preserving whitespace, line endings, and source syntax. They do not parse JSON or repeat content validation. There is no per-note document schema version; persisted format changes use database migrations.

## Hierarchy and revisions

`ParentId` is a folder ID or `null`, which represents the virtual workspace root. `validateFolderDestination` checks that the destination exists, its ancestor path reaches root, and the path excludes the folder being moved. This prevents missing parents and moves into a folder's own subtree.

Hierarchy checks, revision checks, and mutations share an immediate transaction. Folder deletion atomically removes its subtree through foreign-key cascades. Tree listing returns a consistent metadata snapshot without loading note bodies.

Note rename, move, body update, and deletion require the caller's loaded `expectedRevision`. The shared service check `assertExpectedRevision` rejects stale updates and deletes with the loaded/current counters. SQL also requires the expected revision, increments it atomically on updates, and returns committed metadata through the service. These checks share the write transaction. Revisions track individual note changes; the database migration version tracks the storage format.

## Files

| File                           | Responsibility                                                          |
| ------------------------------ | ----------------------------------------------------------------------- |
| [open.ts](open.ts)             | Public entry point and connection lifecycle.                            |
| [types.ts](types.ts)           | Workspace handle and typed service interface.                           |
| [service.ts](service.ts)       | Validation, hierarchy rules, revisions, transactions, and reads.        |
| [repository.ts](repository.ts) | Internal prepared, parameterized SQL.                                   |
| [validation.ts](validation.ts) | Workspace error policy and Markdown byte-limit classification.          |
| [errors.ts](errors.ts)         | `WorkspaceError` construction and safe handling of unexpected failures. |

`WorkspaceError` selects the fixed message for an `ApiErrorCode` and validates the public error envelope. Its constructor requires note ID and revision details for `REVISION_CONFLICT`. Errors never include SQL diagnostics or saved content.

## Migrations and tests

[Versioned migrations](../database/migrations.ts) own persisted format changes. Never edit applied migrations or reset an existing database to resolve a failure. Migration details and design rationale live in [the persistence architecture](../../../../docs/architecture/persistence.md).

The [Markdown migration](../database/migrations/002-markdown.ts) unwraps legacy paragraph/text records, concatenating text runs and separating paragraphs with blank lines. It preserves text verbatim and retains note IDs, hierarchy, revisions, and timestamps. Unsupported or invalid legacy content aborts the entire migration; the original database remains unchanged.

[Service tests](__test__/service.test.ts) and [workspace lifecycle tests](__test__/open.test.ts) use isolated SQLite files to check rejected writes, rollback, conflicts, and durability after reopening. Persistence tests may use raw SQL to prepare temporary fixtures, inject failures, simulate other format versions, and inspect stored rows.
