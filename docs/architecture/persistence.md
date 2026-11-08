# Persistence and document model

| Record | Stored information                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| Folder | ID, name, optional parent folder ID, creation/update timestamps.                                                  |
| Note   | ID, title, optional folder ID, rich document JSON, document schema version, revision, creation/update timestamps. |

A null parent/folder represents the workspace root. Lowercase UUID v4 IDs identify resources independently of their names or locations. Initial shape/name/revision rules and the provisional version-1 paragraph document are defined in the contracts package and [API contracts](../api.md). These schemas do not validate database hierarchy or concurrency.

Rich JSON is canonical because the editor needs structured blocks and marks. Markdown is a conversion format: it preserves the supported content set and Mermaid source, but cannot promise exact source whitespace or arbitrary rich formatting. Version the stored document schema so incompatible content is detected rather than silently misread.

Finalize editor-specific validation during the compatibility spike, then validate it through the real API and reopened database before treating the integrated document API as stable. The initial release's [compatibility checkpoint](../../roadmaps/initial-project.md#editor-and-backend-compatibility-checkpoint) defines ownership, checks, and required reruns.

Use `better-sqlite3`, foreign keys, WAL, a busy timeout, and ordered SQL migrations as the storage implementation. Index parent references for hierarchy queries. SQLite suits a single local process and avoids operating another service. Its synchronous access is a simple fit for this workload; long-running work must stay out of request transactions.

Enforce valid parents and reject cycles in the service layer. Validate and apply hierarchy changes in one transaction. Folder deletion removes descendants and notes atomically. Persist note changes only when their expected revision matches, incrementing that revision in the same write. Never reset an existing database to recover from a migration error.

## Workspace root

The current single-user workspace has a virtual root, represented by null parent/folder references. It is not a stored folder. See [the root decision](../decisions/0002-workspace-root.md) for the tradeoffs and the distinction between hierarchy and future ownership. This release has no users/workspace records or permission model.

## Implemented storage schema

The [initial migration](../../apps/server/src/database/migrations/001-workspace.ts) defines strict SQLite tables:

| Table             | Columns                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| folders           | id, name, parent_id, created_at, updated_at                                                    |
| notes             | id, title, folder_id, document_json, document_schema_version, revision, created_at, updated_at |
| schema_migrations | version, name, checksum, applied_at                                                            |

The document_json column stores only the editor tree; document_schema_version is stored separately. Services reconstruct the API envelope from both fields. Database checks require an object-shaped valid JSON value, positive document versions, safe positive note revisions, and basic name lengths. Complete document/name validation still belongs to the contracts and services. Folder references have foreign keys with cascade deletion; parent_id and folder_id are indexed. A direct self-parent is rejected by a check constraint. General cycle/move rules and note write conflicts remain application-service responsibilities.

The SQL schema version (PRAGMA user_version), document format version (document_schema_version), and each note's edit counter (revision) are independent.

## Migration lifecycle

[openDatabase](../../apps/server/src/database/open.ts) creates the configured directory, opens the native connection, enables foreign keys, selects WAL, uses a 5000 ms busy timeout by default, and sets synchronous=FULL. The [SQLite WAL documentation](https://www.sqlite.org/wal.html) explains its synchronization behavior. The factory returns only after migrations succeed and closes a failed connection before reporting a sanitized startup error.

The [migration registry/runner](../../apps/server/src/database/migrations.ts) uses consecutive versions beginning at 1. It checks applied versions, names, SQL SHA-256 checksums, and user_version before applying pending SQL. The migration journal, pending SQL, and version updates run inside one immediate transaction; a failure rolls back the entire pending batch. A newer/inconsistent history or changed applied migration is rejected rather than repaired, downgraded, or reset.

Append a new migration for persisted changes. Never edit an applied migration's version, name, or SQL. SQL definitions are code-owned, run synchronously, and must not contain their own transaction control. SQL is embedded in versioned TypeScript modules so development and the production bundle use the same migration text without filesystem asset copying. The runner uses [better-sqlite3 transactions](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function).

[File-backed tests](../../apps/server/src/database/migrations.test.ts) cover idempotence, upgrades with existing records, complete rollback, incompatible/newer history, and reopening. [Connection tests](../../apps/server/src/database/open.test.ts) cover actual foreign keys/settings, hierarchy indexes, saved JSON/metadata, real locks, corruption, and unavailable paths. [Runtime tests](../../apps/server/src/server.test.ts) cover startup and HTTP/database shutdown. All use isolated temporary directories, never the normal workspace data.

Initial storage is verified for the paragraph-only document format. Services and resource routes remain in later tasks, and the editor compatibility checkpoint must recheck the finalized document schema with persisted data.
