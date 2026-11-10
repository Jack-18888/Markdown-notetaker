# Editing, saving, and conversion

## Rich editing

The compatibility module uses open-source Tiptap 3.33.0 with `@tiptap/markdown`, chosen for extensible rich blocks and local Markdown conversion. The [extension configuration](../../apps/web/src/editor/extensions.ts) covers the release's rich blocks and marks, including nested tasks and a dedicated Mermaid node. Underline and automatic trailing paragraphs are disabled because they have no reliable source representation here. The full editor UI remains pending.

[Schema/DOM fixtures](../../apps/web/src/editor/__test__/extensions.test.ts) verify supported block round trips and literal code/diagram rendering. Code fences grow to exceed any embedded backtick run. Imported HTML, unsupported-source detection, and original-source retention must be handled by the conversion boundary before application UI loads external Markdown.

The [source policy](../../apps/web/src/editor/source-policy.ts) checks Marked tokens without generating HTML. Tables, images, embedded HTML/comments, YAML/TOML frontmatter, reference definitions, math, extra fence metadata, NUL/BOM, mixed task/plain lists, and diagrams nested inside containers require source fallback. Unsafe links also require fallback. Ordinary fenced and inline code stay literal and are not inspected as markup. Rich conversion is limited to 128 KiB of UTF-8 source, 10,000 tokens, and nesting depth 32; larger valid API notes remain available as raw source. These limits constrain conversion, not stored Markdown or import limits. Source retention and the read-only view are being added before editor UI integration.

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
