# Note history

**Status** · Proposed for review

Let users compare and restore saved Markdown versions. Keep note opens fast by rebuilding the current body from a recent snapshot and a bounded number of changes. [Product requirements](../docs/requirements.md)

## Schema

### `notes` (existing)

- **Add `body_revision INTEGER NOT NULL`.** The note revision that holds the latest Markdown body. Set it on creation and advance it when the body changes. Use `notes.revision` for conflict checks on all updates, including renames and moves.
- **Drop `content TEXT`.** In a versioned migration, copy each current body into an initial snapshot using `notes.revision` and `notes.updated_at`, then set `body_revision` to that revision and drop the column.

### `note_snapshots` (new)

| Column     | Type      | Tracks                                         |
| ---------- | --------- | ---------------------------------------------- |
| `note_id`  | `TEXT`    | The note that owns the snapshot.               |
| `revision` | `INTEGER` | The note revision represented by the snapshot. |
| `saved_at` | `TEXT`    | When that revision was saved, in UTC.          |
| `content`  | `TEXT`    | The complete raw Markdown at that revision.    |

### `note_changes` (new)

| Column          | Type      | Tracks                                                                                                                                                                                                             |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `note_id`       | `TEXT`    | The note that owns the change batch.                                                                                                                                                                               |
| `revision`      | `INTEGER` | The note revision produced by the batch.                                                                                                                                                                           |
| `base_revision` | `INTEGER` | The previous body revision the batch applies to. It may precede metadata-only revisions.                                                                                                                           |
| `saved_at`      | `TEXT`    | When that revision was saved, in UTC.                                                                                                                                                                              |
| `patch_format`  | `INTEGER` | The patch encoding version, starting at `1`.                                                                                                                                                                       |
| `patch`         | `TEXT`    | A JSON array of non-overlapping Markdown replacements ordered by offset. Each has a zero-based `offset`, `deleteCount`, and `insert` text. Offsets and delete counts use Unicode code points in the base Markdown. |

All columns in both new tables are required. Both use `(note_id, revision)` as the primary key. Each `note_id` references `notes(id)` with `ON DELETE CASCADE`. Find adjacent snapshots by revision order.

## Saves and reads

Create the first snapshot with the note. For each changed body, derive a patch on the server and store one batch or snapshot with the note revision update in one transaction. Renames, moves, and identical body saves create no history entries.

In one read transaction, load the note, find the newest snapshot at or before `body_revision`, and replay changes through `body_revision` in order. Verify the chain reaches the target revision. Return complete Markdown through the existing note API. Use the same replay path for historical revisions.

## Snapshots and retention

- Start with a snapshot after 100 change batches or 1 MiB of encoded changes since the last snapshot, whichever comes first. Store the new body directly as a snapshot when computing or storing its patch would exceed the budget. Tune the thresholds using measured save and replay times.
- Keep the latest 100 saved body versions, plus the newest available older snapshot per UTC month for the last 12 months. Show those retained versions in history.
- Prune during body saves in the same transaction as any new snapshot. Keep the base snapshots and changes needed to reconstruct every retained version. Changes between older monthly snapshots can expire.

## Compare and restore

Flush pending edits before opening history. List retained versions newest first and show a Markdown diff against the current body. On confirmation, check that the current note revision still matches the comparison. Save the restored body as a new version so the replaced body is still recoverable. If the revision changed, refresh the comparison and ask for confirmation again. An identical restore is a no-op.

## Implementation

1. **T01 · Storage.** Add the migration.
   - **Acceptance.** In temporary SQLite databases, migrated Markdown matches byte for byte after reopen, failed upgrades roll back, and deleting a note or its folder removes its history.
2. **T02 · Save, replay, and prune.** Implement the transactional storage paths.
   - **Acceptance.** A snapshot is created at either threshold. Pruning follows the retention policy, and every retained version replays exactly, including Unicode, CRLF, and large edits. Metadata-only and identical saves add zero history entries. Stale writes return a conflict and commit zero changes.
3. **T03 · History and restore.** Add list, read, and restore endpoints and a history view.
   - **Acceptance.** Keyboard users can compare and restore versions. Failed saves preserve drafts, stale confirmations require a fresh comparison, and restoring creates a version with the replaced body still recoverable.
4. **T04 · Release checks.** Benchmark a long history and test the built app. [Repository checks](../README.md#checks)
   - **Acceptance.** Repository checks pass, save and open timings are recorded with the fixture size, and a retained version can be restored after a production restart.
