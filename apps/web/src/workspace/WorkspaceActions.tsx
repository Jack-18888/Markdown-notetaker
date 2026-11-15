import type { NoteMetadata } from '@markdown-note-taker/contracts';
import ActionDisclosure from './ActionDisclosure.js';
import type { LifecycleAction } from './lifecycle.js';
import type { Selection } from './tree.js';

export default function WorkspaceActions({
  selection,
  note,
  onAction,
  onRefresh,
}: {
  selection: Selection;
  note: NoteMetadata | null;
  onAction(action: LifecycleAction): void;
  onRefresh(): void;
}) {
  const parentId =
    selection.kind === 'folder' ? selection.id : (note?.folderId ?? null);
  const waiting = selection.kind === 'note' && !note;
  return (
    <div className="sidebar-actions">
      <button
        type="button"
        className="quiet-button new-note"
        disabled={waiting}
        onClick={() => onAction({ kind: 'create', resource: 'note', parentId })}
      >
        <span aria-hidden="true">+</span> New note
      </button>
      <ActionDisclosure label="Workspace actions" iconOnly>
        <button
          type="button"
          disabled={waiting}
          onClick={() =>
            onAction({ kind: 'create', resource: 'folder', parentId })
          }
        >
          New folder
        </button>
        <button
          type="button"
          disabled={waiting}
          onClick={() => onAction({ kind: 'import', parentId })}
        >
          Import Markdown
        </button>
        <button type="button" onClick={onRefresh}>
          Refresh workspace
        </button>
      </ActionDisclosure>
    </div>
  );
}
