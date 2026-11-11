# Persistence and document model

| Record | Stored information                                                                         |
| ------ | ------------------------------------------------------------------------------------------ |
| Folder | ID, name, optional parent folder ID, creation/update timestamps.                           |
| Note   | ID, title, optional folder ID, raw Markdown content, revision, creation/update timestamps. |

A null parent/folder represents the workspace root. Lowercase UUID v4 IDs identify resources independently of their names or locations. Shape, name, revision, and Markdown text limits are defined in the contracts package and [API contracts](../api.md).

Raw Markdown is canonical. SQLite stores the entire source string without parsing, normalization, or editor-node validation. Rich editor conversion and rendering remain frontend responsibilities. See [the storage decision](../decisions/0003-raw-markdown.md).

Verify frontend conversion against the raw Markdown API and reopened database at the initial release's [compatibility checkpoint](../../roadmaps/initial-project.md#editor-and-backend-compatibility-checkpoint).

Use `better-sqlite3`, foreign keys, WAL, a busy timeout, and ordered SQL migrations as the storage implementation. Index parent references for hierarchy queries. SQLite suits a single local process and avoids operating another service. Its synchronous access is a simple fit for this workload; long-running work must stay out of request transactions.

## Workspace root

The current single-user workspace has a virtual root, represented by null parent/folder references. It is not a stored folder. See [the root decision](../decisions/0002-workspace-root.md) for the tradeoffs and the distinction between hierarchy and future ownership. This release has no users/workspace records or permission model.

## Implemented storage schema

The [initial migration](../../apps/server/src/database/migrations/001-workspace.ts) is retained unchanged. [Migration 2](../../apps/server/src/database/migrations/002-markdown.ts) defines the current note storage:

| Table             | Columns                                                         |
| ----------------- | --------------------------------------------------------------- |
| folders           | id, name, parent_id, created_at, updated_at                     |
| notes             | id, title, folder_id, content, revision, created_at, updated_at |
| schema_migrations | version, name, checksum, applied_at                             |

The content column is non-null SQLite TEXT containing raw Markdown. Database checks require safe positive note revisions and basic name lengths. Folder references have foreign keys with cascade deletion; parent_id and folder_id are indexed. A direct self-parent is rejected by a check constraint. Application validation and mutation rules are documented in the [workspace README](../../apps/server/src/workspace/README.md).

PRAGMA user_version tracks the database storage format; each note's revision tracks its edits. There is no separate document schema version.

## Folder and note services

The [workspace README](../../apps/server/src/workspace/README.md) owns the explanation of its public entry point, validation policy, hierarchy and revision rules, transactions, errors, file responsibilities, and tests. [Task evidence](../../roadmaps/initial-project.md#t04) records verification commands and results.

## Migration lifecycle

[openDatabase](../../apps/server/src/database/open.ts) creates the configured directory, opens the native connection, enables foreign keys, selects WAL, uses a 5000 ms busy timeout by default, and sets synchronous=FULL. The [SQLite WAL documentation](https://www.sqlite.org/wal.html) explains its synchronization behavior. The factory returns only after migrations succeed and closes a failed connection before reporting a sanitized startup error.

The [migration registry/runner](../../apps/server/src/database/migrations.ts) uses consecutive versions beginning at 1. It checks applied versions, names, SQL SHA-256 checksums, and user_version before applying pending SQL. The migration journal, pending SQL, and version updates run inside one immediate transaction; a failure rolls back the entire pending batch. A newer/inconsistent history or changed applied migration is rejected rather than repaired, downgraded, or reset.

Append a new migration for persisted changes. Never edit an applied migration's version, name, or SQL. SQL definitions are code-owned, run synchronously, and must not contain their own transaction control. SQL is embedded in versioned TypeScript modules so development and the production bundle use the same migration text without filesystem asset copying. The runner uses [better-sqlite3 transactions](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function).

A migration may register versioned SQLite helper functions before its SQL runs. Keep each helper immutable with its migration. Migration 2 registers a frozen reader for the original paragraph/text format, concatenates text runs verbatim, and separates paragraphs with blank lines. IDs, hierarchy, revisions, and timestamps remain unchanged. Unknown versions, unsupported nodes/attributes, or text that cannot be preserved abort the entire upgrade, retaining schema 1 and all original rows. [Migration tests](../../apps/server/src/database/migrations/__test__/002-markdown.test.ts) verify upgrade, reopen, and rollback.

[File-backed tests](../../apps/server/src/database/__test__/migrations.test.ts) cover idempotence, upgrades with existing records, complete rollback, incompatible/newer history, and reopening. [Connection tests](../../apps/server/src/database/__test__/open.test.ts) cover actual foreign keys/settings, hierarchy indexes, saved Markdown/metadata, real locks, corruption, and unavailable paths. [Runtime tests](../../apps/server/src/__test__/server.test.ts) cover startup and HTTP/database shutdown. All use isolated temporary directories, never the normal workspace data.

Storage and services are verified for raw Markdown. [HTTP integration](../api.md) and the [T09 editor/backend checkpoint](../../roadmaps/initial-project.md#t09) verify frontend conversion against persisted source. [T12](../../roadmaps/initial-project.md#t12) adds exact file round trips; [T14](../../roadmaps/initial-project.md#t14) and [T15](../../roadmaps/initial-project.md#t15) cover production restart and stopped-server backup/restore.
