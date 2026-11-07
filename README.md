# Markdown Note Taker

A local note-taking app for project notes, personal documentation, and technical writing. Organize notes in nested folders and write in a Notion-like rich editor, with Mermaid diagrams alongside your text.

Use it to keep a project's meeting notes, checklists, code examples, and architecture diagrams together. Notes are designed to live in SQLite on your computer; Markdown import and export provide portable `.md` files.

**Status:** Planning stage. This repository contains the specification and implementation backlog; the application is not runnable yet. The features below describe the planned first release.

## Planned features

- **Folder organization:** Create, rename, move, and delete notes and nested folders.
- **Rich writing:** Format headings, lists, checklists, quotes, links, and code blocks using Markdown shortcuts, formatting controls, and a slash menu.
- **Mermaid diagrams:** Edit diagram source and preview the result inside a note. Invalid syntax stays editable and displays an inline error.
- **Autosave:** See save status, retry failed saves, and resolve competing edits from another browser tab.
- **Markdown import/export:** Bring in existing `.md` files and export notes with their diagram source.

## Local deployment

There is no installable application yet. The planned deployment is a Node.js process serving the React frontend and Express API on localhost, with a configurable local SQLite data directory. No separate database server or external account is required by the design. Tested installation commands and configuration will be documented here once the application can run.

The first release is for one person on their own computer. Public hosting, shared workspaces, and cloud sync are outside its scope.

## Project documentation

- [Product requirements](docs/requirements.md) — goals, core capabilities, and product constraints.
- [Architecture](docs/architecture.md) — proposed design, tradeoffs, and open technical questions.
- [Roadmaps](roadmaps/) — feature and release design documents with detailed requirements, acceptance criteria, and tasks.
- [Agent instructions](AGENTS.md) — repository conventions for coding agents.
