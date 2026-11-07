# Product requirements

Markdown Note Taker helps people organize ideas, project notes, and technical documentation in a personal workspace. It brings structured writing and diagrams together while keeping the user's saved content on their own computer.

This document defines product-level goals and constraints. Feature and release designs, detailed requirements, acceptance scenarios, and implementation tasks belong in individual documents under [roadmaps](../roadmaps/). [Architecture](architecture.md) explains the technical design.

## Intended use

The product serves an individual writing and maintaining their own notes. Typical uses include organizing project knowledge, keeping meeting notes and checklists, recording code examples, and explaining systems with diagrams.

Local personal use is the current product boundary. Shared workspaces and a hosted service would require a deliberate change to the product and security model.

## Core capabilities

- **Organization:** Arrange notes in a folder hierarchy so related information is easy to find and maintain.
- **Writing:** Provide a readable, Notion-like rich editing experience with Markdown-compatible content.
- **Diagrams:** Keep editable Mermaid diagrams alongside the text they explain.
- **Portability:** Import and export Markdown so content can move into and out of the workspace.
- **Persistence:** Retain saved notes locally and make save outcomes clear.

## Quality goals

Protect existing content and pending edits during normal use and recoverable failures. Report failures clearly rather than silently losing or replacing user work.

Keep the core workflow usable by keyboard and maintain a readable interface across browser widths. Treat imported text, links, and diagrams as untrusted content.

Support local operation without requiring an external account or service. Keep data ownership explicit: SQLite holds working documents, while Markdown is the interchange format.

## Technical constraints

Use Node.js, TypeScript, Express, and SQLite for the backend, and React for the frontend. Specific libraries, data models, and deployment mechanics are design decisions documented in the architecture.

## Feature and release planning

Each roadmap defines the detailed requirements, scope exclusions, acceptance criteria, and tasks for a particular feature or release. The user specifies which roadmap to follow; there is no default roadmap. Those details are maintained in the selected file rather than repeated in this document.

Update this document when the product's purpose, core capabilities, quality goals, or constraints change. A new release or a completed task does not by itself change these product requirements.
