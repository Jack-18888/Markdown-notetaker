import { useId, useRef, useState } from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';
import Modal from '../workspace/Modal.js';
import { editorLink, setEditorLink } from './commands.js';
import { isSafeLink } from './links.js';

export default function LinkDialog({
  editor,
  onClose,
}: {
  editor: EditorView;
  onClose(): void;
}) {
  const id = useId();
  const selection = useRef(editor.state.selection);
  const [href, setHref] = useState<string>(editorLink(editor) ?? '');
  const [error, setError] = useState('');
  function close() {
    onClose();
    // The native modal releases focus during the React unmount.
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.focus();
    });
  }
  function apply(value: string | null) {
    if (value !== null && !isSafeLink(value)) {
      setError('Use an http, https, mailto, or relative link without spaces.');
      return;
    }
    if (editor.state.doc === selection.current.$from.doc)
      editor.dispatch(editor.state.tr.setSelection(selection.current));
    if (setEditorLink(editor, value)) close();
    else
      setError('This selection cannot be linked. Select text and try again.');
  }
  return (
    <Modal title="Edit link" pending={false} onDismiss={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(href);
        }}
      >
        <label htmlFor={id}>Link address</label>
        <input
          id={id}
          value={href}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={`${id}-error`}
          onChange={(event) => {
            setHref(event.target.value);
            setError('');
          }}
        />
        <p id={`${id}-error`} className="dialog-error" role="alert">
          {error}
        </p>
        <div className="dialog-actions">
          <button type="button" className="workspace-retry" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="workspace-retry"
            onClick={() => apply(null)}
          >
            Remove link
          </button>
          <button type="submit" className="dialog-primary">
            Apply link
          </button>
        </div>
      </form>
    </Modal>
  );
}
