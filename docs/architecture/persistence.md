# Persistence and document model

| Record | Stored information                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| Folder | ID, name, optional parent folder ID, creation/update timestamps.                                                  |
| Note   | ID, title, optional folder ID, rich document JSON, document schema version, revision, creation/update timestamps. |

A null parent/folder represents the workspace root. Lowercase UUID v4 IDs identify resources independently of their names or locations. Initial shape/name/revision rules and the provisional version-1 paragraph document are defined in the shared package and [API contracts](../api.md). These schemas do not validate database hierarchy or concurrency.

Rich JSON is canonical because the editor needs structured blocks and marks. Markdown is a conversion format: it preserves the supported content set and Mermaid source, but cannot promise exact source whitespace or arbitrary rich formatting. Version the stored document schema so incompatible content is detected rather than silently misread.

Finalize editor-specific validation during the compatibility spike, then validate it through the real API and reopened database before treating the integrated document API as stable. The initial release's [compatibility checkpoint](../../roadmaps/initial-project.md#editor-and-backend-compatibility-checkpoint) defines ownership, checks, and required reruns.

Use `better-sqlite3`, foreign keys, WAL, a busy timeout, and ordered SQL migrations as the proposed storage implementation. Index parent references for hierarchy queries. SQLite suits a single local process and avoids operating another service. Its synchronous access is a simple fit for this workload; long-running work must stay out of request transactions.

Enforce valid parents and reject cycles in the service layer. Validate and apply hierarchy changes in one transaction. Folder deletion removes descendants and notes atomically. Persist note changes only when their expected revision matches, incrementing that revision in the same write. Never reset an existing database to recover from a migration error.

## Workspace root

The current single-user workspace has a virtual root, represented by null parent/folder references. It is not a stored folder. See [the root decision](../decisions/0002-workspace-root.md) for the tradeoffs and the distinction between hierarchy and future ownership. This release has no users/workspace records or permission model.
