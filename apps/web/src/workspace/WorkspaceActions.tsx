import type { NoteMetadata } from '@markdown-note-taker/contracts';
import type { LifecycleAction, ResourceTarget } from './lifecycle.js';
import type { Selection, WorkspaceTree } from './tree.js';

export default function WorkspaceActions({
  tree,
  selection,
  note,
  onAction,
}: {
  tree: WorkspaceTree;
  selection: Selection;
  note: NoteMetadata | null;
  onAction(action: LifecycleAction): void;
}) {
  const parentId =
    selection.kind === 'folder' ? selection.id : (note?.folderId ?? null);
  const target: ResourceTarget | null =
    selection.kind === 'folder'
      ? selection.id === null
        ? null
        : { kind: 'folder', value: tree.folders.get(selection.id)! }
      : note
        ? { kind: 'note', value: note }
        : null;
  const waiting = selection.kind === 'note' && !note;
  return (
    <div
      className="lifecycle-tools"
      role="group"
      aria-label="Workspace actions"
    >
      <button
        type="button"
        className="workspace-retry"
        disabled={waiting}
        onClick={() => onAction({ kind: 'create', resource: 'note', parentId })}
      >
        New note
      </button>
      <button
        type="button"
        className="workspace-retry"
        disabled={waiting}
        onClick={() =>
          onAction({ kind: 'create', resource: 'folder', parentId })
        }
      >
        New folder
      </button>
      <button
        type="button"
        className="workspace-retry"
        disabled={waiting}
        onClick={() => onAction({ kind: 'import', parentId })}
      >
        Import Markdown
      </button>
      {target && (
        <button
          type="button"
          className="workspace-retry"
          onClick={() => onAction({ kind: 'rename', target })}
        >
          Rename {target.kind}
        </button>
      )}
      {target && (
        <button
          type="button"
          className="workspace-retry"
          onClick={() => onAction({ kind: 'move', target })}
        >
          Move {target.kind}
        </button>
      )}
      {target && (
        <button
          type="button"
          className="workspace-retry"
          onClick={() => onAction({ kind: 'delete', target })}
        >
          Delete {target.kind}
        </button>
      )}
    </div>
  );
}
