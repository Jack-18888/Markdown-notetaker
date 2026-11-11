import { useId, useState } from 'react';
import { nameSchema } from '@markdown-note-taker/contracts';
import { createFolder, createNote, updateFolder, updateNote } from './api.js';
import type { NameAction } from './lifecycle.js';
import Modal from './Modal.js';
import type { WorkspaceTree } from './tree.js';
import { useOperation, type OperationCallbacks } from './useOperation.js';

export default function NameDialog({
  action,
  tree,
  ...callbacks
}: OperationCallbacks & { action: NameAction; tree: WorkspaceTree }) {
  const resource =
    action.kind === 'create' ? action.resource : action.target.kind;
  const [name, setName] = useState(
    action.kind === 'create'
      ? ''
      : action.target.kind === 'folder'
        ? action.target.value.name
        : action.target.value.title,
  );
  const [validationError, setValidationError] = useState('');
  const id = useId();
  const operation = useOperation(async (signal) => {
    if (action.kind === 'create') {
      if (action.resource === 'folder')
        return {
          kind: 'folder',
          id: (await createFolder(name, action.parentId, signal)).id,
        };
      return {
        kind: 'note',
        id: (await createNote(name, action.parentId, signal)).id,
      };
    }
    if (action.target.kind === 'folder') {
      await updateFolder(action.target.value.id, { name }, signal);
      return { kind: 'folder', id: action.target.value.id };
    }
    await updateNote(
      action.target.value.id,
      { title: name, expectedRevision: action.target.value.revision },
      signal,
    );
    return { kind: 'note', id: action.target.value.id };
  }, callbacks);
  return (
    <Modal
      title={`${action.kind === 'create' ? 'New' : 'Rename'} ${resource}`}
      pending={operation.pending}
      onDismiss={operation.dismiss}
    >
      {action.kind === 'create' && (
        <p>
          In{' '}
          <strong>
            {[
              'Workspace',
              ...tree.breadcrumbs(action.parentId).map((folder) => folder.name),
            ].join(' / ')}
          </strong>
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!operation.saved && !nameSchema.safeParse(name).success) {
            setValidationError(
              'Use 1–200 characters without surrounding spaces or control characters.',
            );
            return;
          }
          setValidationError('');
          void operation.run();
        }}
      >
        <label htmlFor={id}>
          {resource === 'folder' ? 'Folder name' : 'Note title'}
        </label>
        <input
          id={id}
          value={name}
          required
          maxLength={400}
          disabled={operation.pending || operation.saved}
          aria-invalid={!!validationError}
          aria-describedby={`${id}-error`}
          onChange={(event) => {
            setName(event.target.value);
            setValidationError('');
          }}
        />
        <p id={`${id}-error`} className="dialog-error" role="alert">
          {validationError || operation.error}
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
            disabled={operation.pending}
          >
            {operation.pending
              ? 'Saving…'
              : operation.saved
                ? 'Retry refresh'
                : action.kind === 'create'
                  ? `Create ${resource}`
                  : 'Save name'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
