# Clipboard images

## Goal and agreed scope

Paste screenshots or copied image files into the rich editor, store their bytes
locally in SQLite, and render them through stable Markdown image links. Accept one
PNG, JPEG, or WebP per paste, up to 5 MiB. Web URL images, file pickers,
drag-and-drop, image editing dialogs, and portable ZIP export are deferred.

SQLite keeps image bytes and metadata transactional and included in the existing
database backup. Images are workspace resources, independent of note deletion;
identical bytes are deduplicated and unused-image cleanup is deferred. Markdown
export retains `/api/images/{id}` links and does not embed image bytes.

## Three-PR Graphite stack

Base: updated `main`. Each PR includes relevant tests and owning documentation.

1. **Storage and API** (`codex/image-storage-api`): versioned image-table migration;
   protected, bounded raw upload and image retrieval; portable contracts;
   signature/MIME validation, deduplication, migration and reopen tests.
2. **Rendering** (`codex/local-image-rendering`): guarded local image schema,
   Markdown conversion/serialization, responsive rendering, unavailable-image
   state, supported-container and hostile-source tests.
3. **Clipboard** (`codex/clipboard-images`): image-first clipboard handling,
   mapped placeholders, retry/remove, late-response protection, save/export/
   navigation coordination, and real browser coverage.

## Implementation and acceptance

- Add an `images` table with UUID, MIME type, byte length, SHA-256, BLOB, and
  creation timestamp through a new migration; never change existing migrations.
- `POST /api/images` accepts allowed raw image bytes and returns `201 { id, url }`.
  `GET /api/images/{id}` serves validated MIME with `nosniff`. Existing loopback,
  origin, validation, and sanitized-error policies apply.
- Only canonical local image URLs are permitted by Markdown assessment, DOM
  parsing, rendering, and serialization. External/relative/data/blob URLs and raw
  HTML retain the safe source fallback. Alt text and optional titles round-trip;
  untouched Markdown remains byte-identical.
- Paste inserts a temporary placeholder at the selection, tracked through edits.
  Successful upload replaces it with an image; failed upload retains bytes in
  memory with Retry/Remove. Undo/removal/disposal prevents late reinsertion.
- Pending placeholders count as unsaved work. Saves/export/navigation cannot
  serialize placeholders; uploading waits, failed uploads require retry/removal.
  Ordinary text and code-block paste retain existing behavior.
- Images fit the writing column, preserve aspect ratio, have accessible names and
  visible selection, and show readable load failures.
- Verify HTTP/database durability, deduplication, invalid/oversized uploads,
  existing-data migrations, safe conversion, clipboard workflow, concurrent edits,
  undo, upload recovery, export/navigation, production restart and backup/restore.

## Verification record

Implementation and verification are in progress. Record actual commands and
outcomes here before handoff.
