import { useId, useState } from 'react';
import { updateFolder, updateNote } from './api.js';
import { moveChoices, type MoveAction } from './lifecycle.js';
import Modal from './Modal.js';
import type { WorkspaceTree } from './tree.js';
import { useOperation, type OperationCallbacks } from './useOperation.js';

export default function MoveDialog({
  action,
  tree,
  ...callbacks
}: OperationCallbacks & { action: MoveAction; tree: WorkspaceTree }) {
  const target = action.target;
  const original =
    target.kind === 'folder' ? target.value.parentId : target.value.folderId;
  const [destination, setDestination] = useState(original);
  const id = useId();
  const choices = moveChoices(
    tree,
    target.kind === 'folder' ? target.value.id : undefined,
  );
  const operation = useOperation(async (signal) => {
    if (target.kind === 'folder')
      await updateFolder(target.value.id, { parentId: destination }, signal);
    else
      await updateNote(
        target.value.id,
        { folderId: destination, expectedRevision: target.value.revision },
        signal,
      );
    return { kind: target.kind, id: target.value.id };
  }, callbacks);
  return (
    <Modal
      title={`Move ${target.kind}`}
      pending={operation.pending}
      onDismiss={operation.dismiss}
    >
      <p>
        Choose where to move{' '}
        <strong>
          {target.kind === 'folder' ? target.value.name : target.value.title}
        </strong>
        .
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void operation.run();
        }}
      >
        <label htmlFor={id}>Destination folder</label>
        <select
          id={id}
          value={destination ?? ''}
          disabled={operation.pending || operation.saved}
          onChange={(event) => setDestination(event.target.value || null)}
        >
          {choices.map((choice) => (
            <option key={choice.id ?? 'root'} value={choice.id ?? ''}>
              {choice.label}
            </option>
          ))}
        </select>
        <p role="alert" className="dialog-error">
          {operation.error}
        </p>
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
            className="dialog-primary"
            disabled={
              operation.pending ||
              (!operation.saved && destination === original)
            }
          >
            {operation.pending
              ? 'Moving…'
              : operation.saved
                ? 'Retry refresh'
                : 'Move here'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
