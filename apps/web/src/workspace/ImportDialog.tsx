import { useId, useState } from 'react';
import type { ParentId } from '@markdown-note-taker/contracts';
import { createNote } from './api.js';
import {
  importTitle,
  readMarkdownFile,
  validImportTitle,
} from './markdown-files.js';
import Modal from './Modal.js';
import type { WorkspaceTree } from './tree.js';
import { useOperation, type OperationCallbacks } from './useOperation.js';

export default function ImportDialog({
  parentId,
  tree,
  ...callbacks
}: OperationCallbacks & {
  parentId: ParentId;
  tree: WorkspaceTree;
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [validation, setValidation] = useState('');
  const operation = useOperation(async (signal) => {
    let content: string;
    try {
      content = await readMarkdownFile(file!);
    } catch (error) {
      setValidation((error as Error).message);
      throw error;
    }
    const note = await createNote(title, parentId, signal, content);
    return { kind: 'note', id: note.id };
  }, callbacks);
  return (
    <Modal
      title="Import Markdown"
      pending={operation.pending}
      onDismiss={operation.dismiss}
    >
      <p>
        Import a UTF-8 .md file, up to 256 KiB. Its original source will be
        preserved.
      </p>
      <p>
        In{' '}
        <strong>
          {[
            'Workspace',
            ...tree.breadcrumbs(parentId).map((folder) => folder.name),
          ].join(' / ')}
        </strong>
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!operation.saved && (!file || !validImportTitle(title))) {
            setValidation(
              !file
                ? 'Choose a Markdown file first.'
                : 'Use 1–200 characters without surrounding spaces or control characters.',
            );
            return;
          }
          setValidation('');
          void operation.run();
        }}
      >
        <label htmlFor={`${id}-file`}>Markdown file</label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".md,text/markdown"
          disabled={operation.pending || operation.saved}
          aria-describedby={`${id}-error`}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setTitle(selected ? importTitle(selected.name) : '');
            setValidation('');
          }}
        />
        <label htmlFor={`${id}-title`}>Note title</label>
        <input
          id={`${id}-title`}
          value={title}
          maxLength={400}
          disabled={operation.pending || operation.saved}
          aria-describedby={`${id}-error`}
          onChange={(event) => {
            setTitle(event.target.value);
            setValidation('');
          }}
        />
        <p id={`${id}-error`} className="dialog-error" role="alert">
          {validation || operation.error}
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
              ? 'Importing…'
              : operation.saved
                ? 'Retry opening note'
                : 'Import note'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
