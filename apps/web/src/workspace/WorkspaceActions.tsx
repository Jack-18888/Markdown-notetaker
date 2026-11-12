import type { LifecycleAction } from './lifecycle.js';
import type { Selection, WorkspaceTree } from './tree.js';
import ActionMenu from './ActionMenu.js';

export default function WorkspaceActions({
  tree,
  selection,
  onRefresh,
  onAction,
}: {
  tree: WorkspaceTree;
  selection: Selection;
  onRefresh(): void;
  onAction(action: LifecycleAction): void;
}) {
  const parentId =
    selection.kind === 'folder'
      ? selection.id
      : (tree.notes.get(selection.id)?.folderId ?? null);
  return (
    <div
      className="lifecycle-tools"
      role="group"
      aria-label="Create in workspace"
    >
      <button
        type="button"
        className="dialog-primary"
        onClick={() => onAction({ kind: 'create', resource: 'note', parentId })}
      >
        New note
      </button>
      <button
        type="button"
        className="workspace-retry"
        onClick={() =>
          onAction({ kind: 'create', resource: 'folder', parentId })
        }
      >
        New folder
      </button>
      <ActionMenu label="Workspace actions">
        <button
          type="button"
          className="workspace-retry"
          onClick={() => onAction({ kind: 'import', parentId })}
        >
          Import Markdown
        </button>
        <button type="button" onClick={onRefresh}>
          Refresh workspace
        </button>
      </ActionMenu>
    </div>
  );
}
