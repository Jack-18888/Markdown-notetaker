# Workspace persistence

This module owns application access to saved notes and folders. All application note and folder mutations go through `WorkspaceService`.

## Validate writes, trust reads

Create and update requests are checked against the [contracts](../../../../packages/contracts/src/index.ts) before writing. Content is a raw Markdown string, checked for well-formed Unicode and its UTF-8 byte cap. The backend does not parse Markdown, validate editor nodes, or normalize source. All rendering and rich editor conversion belong to the frontend.

The content field contains the entire Markdown source. Omitted content on creation defaults to an empty string; an explicit empty string clears a note. Omitted patch fields retain their saved values. Successful creates and updates return committed records.

Reads return the saved content string directly, preserving whitespace, line endings, and source syntax. They do not parse JSON or repeat content validation. There is no per-note document schema version; persisted format changes use database migrations.

## Hierarchy and revisions

`ParentId` is a folder ID or `null`, which represents the virtual workspace root. `validateFolderDestination` checks that the destination exists, its ancestor path reaches root, and the path excludes the folder being moved. This prevents missing parents and moves into a folder's own subtree.

Hierarchy checks, revision checks, and mutations share an immediate transaction. Folder deletion atomically removes its subtree through foreign-key cascades. Tree listing returns a consistent metadata snapshot without loading note bodies.

Note rename, move, body update, and deletion require the caller's loaded `expectedRevision`. An update increments the saved revision and returns committed metadata. A stale revision produces a conflict without changing the note. Revisions track individual note changes; the database migration version tracks the storage format.

## Files

| File                                     | Responsibility                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| [types.ts](types.ts)                     | Typed service interface.                                                |
| [service.ts](service.ts)                 | Validation, hierarchy rules, revisions, transactions, and reads.        |
| [repository.ts](repository.ts)           | Internal prepared, parameterized SQL.                                   |
| [validation.ts](validation.ts)           | Generic schema parsing with a caller-supplied failure policy.           |
| [note-validation.ts](note-validation.ts) | Note request validation and Markdown byte-limit error classification.   |
| [errors.ts](errors.ts)                   | `WorkspaceError` construction and safe handling of unexpected failures. |

`WorkspaceError` selects the fixed message for an `ApiErrorCode` and validates the public error envelope. Its constructor requires note ID and revision details for `REVISION_CONFLICT`. Errors never include SQL diagnostics or saved content.

## Migrations and tests

[Versioned migrations](../database/migrations.ts) own persisted format changes. Never edit applied migrations or reset an existing database to resolve a failure. Migration details and design rationale live in [the persistence architecture](../../../../docs/architecture/persistence.md).

The [Markdown migration](../database/migrations/002-markdown.ts) unwraps legacy paragraph/text records, concatenating text runs and separating paragraphs with blank lines. It preserves text verbatim and retains note IDs, hierarchy, revisions, and timestamps. Unsupported or invalid legacy content aborts the entire migration; the original database remains unchanged.

[Service tests](service.test.ts) use isolated SQLite files to check rejected writes, rollback, conflicts, and durability after reopening. Persistence tests may use raw SQL to prepare temporary fixtures, inject failures, simulate other format versions, and inspect stored rows.
