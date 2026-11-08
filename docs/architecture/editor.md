# Editing, saving, and conversion

## Rich editing

The proposed editor is open-source Tiptap with `@tiptap/markdown`, chosen for extensible rich blocks and local Markdown conversion. Verify the full supported block set and custom Mermaid conversion before committing the rest of the interface to it.

Represent a diagram as a dedicated block containing plain Mermaid source. Custom conversion hooks map that block to and from fenced `mermaid` Markdown. The editor extension set, conversion adapters, and server document validator must accept the same document structure.

## Save lifecycle

1. Load the selected note and its revision into the editor. Keep pending title/body changes locally.
2. After 750 ms without edits, queue a save. Serialize writes per note; newer edits made during a request remain pending.
3. On success, acknowledge only the submitted snapshot and revision. An older response must not replace newer edits, undo a rename/move, or update a different selected note.
4. Before switching notes or discarding the active document, flush pending changes. If saving fails, retain the editor and offer retry.
5. On a revision conflict, retain local content until the user explicitly reloads or saves it as a new note.

Reset undo history between notes. A dirty-tab warning helps with ordinary closure; it is not crash recovery or version history.

## Markdown and diagrams

Import converts a selected Markdown file into a validated document before creating a new note. Export flushes pending edits before converting the saved document and downloading it. Conversion failures must not create partial notes or destroy existing content.

The selected roadmap defines supported constructs and the user-visible policy for unsupported imports. For the initial release, see [R6](../../roadmaps/initial-project.md#r6--import-and-export-markdown); conversion adapters must enforce that policy before any note is created.

Render Mermaid asynchronously with unique diagram IDs and per-block request versions. Discard stale results after another edit or note switch, clean up temporary rendering elements, and preserve source on failure. Bound input/rendering complexity so pathological diagrams cannot monopolize the writing interface.

Treat imported content as untrusted even in a local app: disable arbitrary HTML rendering and reject unsafe link protocols. Initialize Mermaid with `securityLevel: 'strict'` and `startOnLoad: false`; disable diagram-supplied configuration overrides and arbitrary HTML labels. Diagram-provided configuration must not weaken these safeguards.

## Why paragraphs contain text nodes

The proposed editor stores a tree of content, following [Tiptap/ProseMirror's document model](https://tiptap.dev/docs/editor/core-concepts/introduction). A paragraph is a block boundary. A text node is a literal text run inside a block. This preserves paragraph structure, inline formatting, cursor positions, and later Markdown conversion without parsing presentation HTML back into a document.

For example, a future formatted paragraph containing "Hello **world**" has a plain text run for "Hello " and a bold-marked run for "world" inside one paragraph. The mark applies to the second run rather than the whole paragraph. Headings, lists, and code blocks will have their own structural roles. This is not sentence splitting, and it does not create separate database rows for paragraphs or runs: each note holds one versioned JSON document.

T02 currently validates only plain paragraph/text nodes to establish the envelope and boundary rules. It is a provisional subset, not a completed rich editor schema. T06 must validate the supported nodes/marks and conversions with the actual editor before T09 checks the API/database integration.
