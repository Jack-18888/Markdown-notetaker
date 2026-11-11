import { deleteFolder, deleteNote } from './api.js';
import { deletionCounts, type DeleteAction } from './lifecycle.js';
import Modal from './Modal.js';
import type { WorkspaceTree } from './tree.js';
import { useOperation, type OperationCallbacks } from './useOperation.js';

export default function DeleteDialog({
  action,
  tree,
  ...callbacks
}: OperationCallbacks & { action: DeleteAction; tree: WorkspaceTree }) {
  const target = action.target;
  const counts =
    target.kind === 'folder' ? deletionCounts(tree, target.value.id) : null;
  const operation = useOperation(async (signal) => {
    if (target.kind === 'folder') {
      await deleteFolder(target.value.id, signal);
      return { kind: 'folder', id: target.value.parentId };
    }
    await deleteNote(target.value.id, target.value.revision, signal);
    return { kind: 'folder', id: target.value.folderId };
  }, callbacks);
  return (
    <Modal
      title={`Delete ${target.kind}`}
      pending={operation.pending}
      onDismiss={operation.dismiss}
    >
      <p>
        <strong>
          {target.kind === 'folder' ? target.value.name : target.value.title}
        </strong>{' '}
        will be permanently deleted. This cannot be undone.
      </p>
      {counts && (
        <p>
          This also deletes all contents: {counts.folders}{' '}
          {counts.folders === 1 ? 'subfolder' : 'subfolders'} and {counts.notes}{' '}
          {counts.notes === 1 ? 'note' : 'notes'}.
        </p>
      )}
      <p role="alert" className="dialog-error">
        {operation.error}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void operation.run();
        }}
      >
        <div className="dialog-actions">
          <button
            type="button"
            className="workspace-retry"
            disabled={operation.pending}
            onClick={operation.dismiss}
          >
            {operation.saved ? 'Close' : 'Cancel'}
          </button>
          <button
            type="submit"
            className={`dialog-primary${operation.saved ? '' : ' dialog-danger'}`}
            disabled={operation.pending}
          >
            {operation.pending
              ? 'Deleting…'
              : operation.saved
                ? 'Retry refresh'
                : 'Delete permanently'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
