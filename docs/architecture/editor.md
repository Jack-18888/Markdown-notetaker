# Editing, saving, and conversion

## Rich editing

The compatibility module uses open-source Tiptap 3.33.0 with `@tiptap/markdown`, chosen for extensible rich blocks and local Markdown conversion. The [extension configuration](../../apps/web/src/editor/extensions.ts) covers the release's rich blocks and marks, including nested tasks and a dedicated Mermaid node. Underline and automatic trailing paragraphs are disabled because they have no reliable source representation here. The full editor UI remains pending.

[Schema/DOM fixtures](../../apps/web/src/editor/__test__/extensions.test.ts) verify supported block round trips and literal code/diagram rendering. Code fences grow to exceed any embedded backtick run. Application UI must use the [conversion boundary](../../apps/web/src/editor/markdown.ts) before loading external Markdown, rather than calling Tiptap's raw parser or Markdown commands directly.

T09's [shared commands](../../apps/web/src/editor/commands.ts) define block choices, formatting/history actions, searchable labels, and validated link changes for the upcoming toolbar and slash menu. They preflight eligibility before consuming a slash query because a failed Tiptap chain does not roll back earlier steps. Diagram insertion is restricted to top-level paragraphs or replacing the full document, matching the conversion policy. [Command tests](../../apps/web/src/editor/__test__/commands.test.ts) use the real editor schema to verify single-update mutations, safe serialization, undo/redo, and unchanged text/selection after rejection. These commands are not yet connected to the selected-note reader; body writes and the complete T09 compatibility checkpoint remain pending.

The [source policy](../../apps/web/src/editor/source-policy.ts) checks Marked tokens without generating HTML. Tables, images, embedded HTML/comments, YAML/TOML frontmatter, reference definitions, math, extra fence metadata, NUL/BOM, mixed task/plain lists, and diagrams nested inside containers require source fallback. Unsafe links also require fallback. Ordinary fenced and inline code stay literal and are not inspected as markup. Rich conversion is limited to 128 KiB of UTF-8 source, 10,000 tokens, and nesting depth 32; larger valid API notes remain available as raw source. These limits constrain conversion, not stored Markdown or import limits.

The [source fallback view](../../apps/web/src/editor/SourceFallback.tsx) explains that the original Markdown is preserved and displays selectable source in a labelled, keyboard-focusable, scrollable block. React escapes the text; the view creates no links, HTML preview, or editable body. The [selected-note reader](../../apps/web/src/workspace/NotePreview.tsx) now uses it for unsupported source; writing controls remain later work. [Fallback view tests](../../apps/web/src/editor/__test__/source-fallback.test.ts) verify literal hostile markup and accessible control names.

`loadMarkdown` returns either the untouched source plus a fallback reason, or a rich document with a guarded serializer. Fallback results expose no editable document or serializer. Rich results capture an immutable ProseMirror baseline separately from the caller's JSON. Unchanged documents serialize to their original bytes; changed documents must pass schema, link, size, and structural round-trip checks before yielding source. Failure throws a fixed `MarkdownConversionError`; callers retain their current editor and saved source. This boundary does not acknowledge saves or replace local editor state.

[Mermaid payload recovery](../../apps/web/src/editor/mermaid-source.ts) preserves top-level diagram strings before Marked normalizes line endings. Editing another block retains exact diagram text, including LF, CRLF, CR, trailing spaces/blank lines, invalid syntax, and embedded backticks. Unclosed diagram fences and unsupported container forms retain the original source in fallback. The [boundary fixtures](../../apps/web/src/editor/__test__/markdown.test.ts) verify source retention, guarded mutations, and exact diagram payloads after other body edits.

Saved content is raw Markdown. The frontend loads that source into the rich editor's internal representation and serializes edits back to Markdown. Editor trees remain frontend state; the backend stores the complete source string. See [the storage decision](../decisions/0003-raw-markdown.md).

Represent a diagram as a dedicated editor block containing plain Mermaid source. Frontend conversion hooks map that block to and from fenced `mermaid` Markdown. Parser and serializer fixtures must cover every supported block and mark before the writing interface relies on them.

Keep the original Markdown until the body is actually edited. Opening, previewing, renaming, moving, or exporting an untouched note must preserve its source, including line endings and whitespace. If the rich editor cannot represent a construct without losing content, retain the raw source and provide a safe read-only fallback instead of saving a reduced document.

## Save lifecycle

1. Load the selected note and its revision into the editor. Keep pending title/body changes locally.
2. After 750 ms without edits, queue a save. Serialize changed editor content to Markdown and writes per note; newer edits made during a request remain pending. Title/location-only changes omit content.
3. On success, acknowledge only the submitted snapshot and revision. An older response must not replace newer edits, undo a rename/move, or update a different selected note.
4. Before switching notes or discarding the active document, flush pending changes. If saving fails, retain the editor and offer retry.
5. On a revision conflict, retain local content until the user explicitly reloads or saves it as a new note.

Reset undo history between notes. A dirty-tab warning helps with ordinary closure; it is not crash recovery or version history.

## Markdown and diagrams

Import stores the selected Markdown source verbatim within the input limits. Export flushes pending edits and downloads the latest saved Markdown without another parse/serialize cycle. Rich editor conversion runs in the frontend when loading or editing, and must preserve content outside the supported rich subset.

The selected roadmap defines supported rich editing constructs and the fallback for other source. For the initial release, see [R6](../../roadmaps/initial-project.md#r6--import-and-export-markdown). Unsupported syntax stays in the saved Markdown; conversion must never silently remove it.

Render Mermaid asynchronously with unique diagram IDs and per-block request versions. Discard stale results after another edit or note switch, clean up temporary rendering elements, and preserve source on failure. Bound input/rendering complexity so pathological diagrams cannot monopolize the writing interface.

Treat all Markdown as untrusted: keep raw HTML inert and unsafe link protocols non-executable in previews and editor views. New link controls reject unsafe protocols. Source preservation must not enable script execution. Initialize Mermaid with `securityLevel: 'strict'` and `startOnLoad: false`; disable diagram-supplied configuration overrides and arbitrary HTML labels.
