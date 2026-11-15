# Editing, saving, and conversion

## Rich editing

The web workspace uses Folio's React block editor, source view, block menu, selection toolbar, and keyboard controls. The note title is separate metadata. A heading at the beginning of the body is part of the Markdown. The title, Editor, and Markdown views share the selected note session, with fresh body undo history on each open.

The [conversion boundary](../../apps/web/src/editor/folio-markdown.ts) uses Remark with GFM and math extensions. Source positions refer to the original string. Rich edits replace the affected block and verify the new block boundaries against the unchanged, original source slices. Opening, switching views, renaming, moving, and exporting an untouched note preserve whitespace and line endings. The [source editing adapter](../../apps/web/src/editor/source-text.ts) maps textarea edits back to source offsets because textareas normalize line endings.

The Editor covers CommonMark block and inline structure, GFM tasks, tables and strikethrough, reference links and definitions, images, and editable footnote references and definitions. Renaming a footnote label updates parsed references and the definition in the same draft. Additional blocks include the five GitHub alert variants, collapsible sections with a summary and Markdown body, the existing empty-paragraph marker, Mermaid, and KaTeX math. The code block renders locally with Lezer and copies its literal text. Wide code, tables, and diagrams have independent scrolling.

Arbitrary HTML and frontmatter remain literal and preserve their source. Markdown mode allows editing any valid body, including notes over the 128 KiB, 10,000-node, or 32-level rich conversion limits. Unsafe link destinations stay inert. Image URLs use the same link policy and require a click to load. The editor turns supported syntax into DOM elements, inserts paste as text, and admits only recognized inline structures when converting the editing DOM back to Markdown. KaTeX uses a fresh macro map with expansion bounds and trust disabled. The [Folio browser regressions](../../tests/e2e/folio.spec.ts) cover the mixed Markdown example, exact file export, reference edits, and hostile source.

## Save lifecycle

The [save coordinator](../../apps/web/src/workspace/SaveCoordinator.ts) holds one note ID and revision. The title and Markdown draft share the 750 ms autosave interval. A request takes an immutable snapshot and submits it with the expected revision. Metadata-only writes omit the body. A successful response acknowledges the submitted source without replacing newer drafts or resetting undo history.

Manual save, export, navigation, and lifecycle operations flush the same queue. A flush waits for an in-flight request and drains newer changes. Failed writes retain the draft, and an uncertain write remains dirty until an acknowledgement. Invalid source remains editable. A failed rich conversion keeps the current editor content and blocks a write until the conversion issue is resolved or undone. The [transition guard](../../apps/web/src/workspace/useNoteTransition.ts) keeps the active note open if saving fails and passes the acknowledged revision to lifecycle actions.

On a conflict, the user can reload the saved note after confirming or preserve their draft in a new root note. Opening a recovery copy uses refresh-only retry after acknowledged creation. Closing the browser with pending edits triggers a dirty-tab warning.

## Markdown and diagrams

Markdown import uses the existing folder-aware file dialog. It decodes UTF-8 strictly with BOM retention, enforces the 256 KiB import limit, and submits the complete source to the create API. Export flushes pending edits and encodes the acknowledged raw Markdown directly as UTF-8. See the [storage decision](../decisions/0003-raw-markdown.md).

Mermaid renders through the [preview boundary](../../apps/web/src/editor/diagram-renderer.ts), with per-request cancellation and a debounce in the [diagram view](../../apps/web/src/editor/MermaidView.tsx). The renderer skips stale requests, uses unique DOM IDs, cleans temporary nodes, and serializes access to Mermaid. The [diagram policy](../../apps/web/src/editor/diagram-policy.ts) rejects diagram configuration and external styles and caps preview work at 16 KiB, 200 lines or semicolon-delimited statements, and 100 edges. The SVG sanitizer removes HTML, external content, links, images, and executable output. Invalid or oversized diagrams remain editable and saveable. Unchanged fenced source retains its exact payload, including mixed line endings.
