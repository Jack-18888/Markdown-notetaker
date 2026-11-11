# 0003: canonical raw Markdown

**Status:** Accepted. Replaces the initial editor-JSON storage design.

## Decision

Store each note's complete Markdown source as SQLite TEXT and expose it as the content string in the API. Keep rich editing in the frontend. Editor-specific trees are transient frontend state and never become the persistence contract.

## Rationale

Markdown is already the note's portable representation. Keeping the original source avoids a dependency between saved data and an editor's node schema, and preserves source syntax, whitespace, line endings, and Mermaid fences through storage. The server validates text and byte limits independently of the renderer.

## Consequences

The frontend parses Markdown for rich editing and safe rendering, and serializes actual body edits back to Markdown. It retains the original source for untouched notes and must preserve unsupported constructs through a safe read-only fallback rather than a lossy save. Rendering remains responsible for inert HTML, safe URLs, and Mermaid isolation.

There is no per-note document schema version. Database migrations manage persisted format changes. The original migration remains unchanged; migration 2 converts the supported legacy paragraph/text format without dropping notes. A conversion failure rolls back the complete upgrade and preserves the previous database.

Exact shapes are documented in [API contracts](../api.md), and the frontend conversion policy in [editor architecture](../architecture/editor.md). Workspace application services remain in T04.

## Verification scope

[Markdown contract tests](../../packages/contracts/src/__test__/markdown.test.ts) check raw source and UTF-8 limits. [Migration tests](../../apps/server/src/database/migrations/__test__/002-markdown.test.ts) verify text/metadata preservation, reopen, and complete rollback for unsupported legacy content. [Task evidence](../../roadmaps/initial-project.md#t04) records commands and outcomes. Rich editor conversion and rendering remain future work.
