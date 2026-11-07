# Agent instructions

## Find the source of truth

- Read the code and configuration involved in the change before editing. Follow the repository's existing language, formatting, dependency, and module conventions.
- Use [product requirements](docs/requirements.md) for goals and constraints, the user-specified roadmap in `roadmaps/` for detailed feature or release requirements and tasks, and [architecture](docs/architecture.md) for technical decisions and rationale. Check the implementation when a document describes a proposal.
- When asked to work from a roadmap, follow the file the user specifies. If none is specified or established in the conversation, ask which one to use rather than choosing a default.
- Keep [README.md](README.md) focused on the public introduction and verified setup instructions. Keep product-level documentation in `docs/` and feature or release plans in `roadmaps/`; update the owning document rather than duplicating specifications here.
- Read package manifests for available commands and configuration for their prerequisites. Never present a planned command or feature as working.

## Change the app safely

- Keep persistence and other server-only dependencies out of browser code and portable shared modules.
- Validate external input at boundaries and use parameterized SQL. Make hierarchy changes and other multi-step data mutations transactional.
- Change persisted formats through versioned migrations. Preserve existing notes; never reset a database to resolve a development or migration failure.
- Retain unsaved content through failed requests and prevent stale responses or conflicting writes from silently replacing user edits.
- Treat Markdown, links, and Mermaid source as untrusted content. Preserve safe rendering and URL handling when changing parsing, preview, or export code.
- Keep note content, databases, secrets, and generated artifacts out of commits and diagnostic output.
- Preserve keyboard operation, accessible control names, and visible focus when changing editor controls, navigation, or dialogs.
- Preserve unrelated user changes. Do not commit, push, deploy, or rewrite Git history unless requested.

## Verify and hand off

- Test observable behavior at the layer affected by the change. Run relevant type, lint, test, or build scripts that exist; report unavailable checks rather than inventing a substitute result.
- Use isolated temporary SQLite databases for persistence tests. Verify migrations against existing data and reopen the database when testing durability; never test destructive operations on the user's notes.
- Use real API/database or browser integration checks where mocks would hide persistence, save-ordering, or editor-conversion failures.
- For documentation changes, check affected links, structured data, and consistency with manifests and related documents.
- Report what changed, checks actually run and their outcomes, and any unresolved limitations.
