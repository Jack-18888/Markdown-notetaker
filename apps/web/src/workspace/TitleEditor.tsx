import { useEffect, useRef, useState, type FormEvent } from 'react';
import { nameSchema, type NoteDetail } from '@markdown-note-taker/contracts';
import { updateNote, WorkspaceRequestError } from './api.js';
import './title-editor.css';

export default function TitleEditor({
  note,
  onSaved,
  onDirtyChange,
}: {
  note: NoteDetail;
  onSaved(note: NoteDetail): void;
  onDirtyChange(dirty: boolean): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);
  const latest = useRef(draft);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(
    () => () => {
      controller.current?.abort();
      onDirtyChange(false);
    },
    [onDirtyChange],
  );
  useEffect(() => {
    if (editing) {
      opened.current = true;
      input.current?.focus();
    } else if (opened.current) editButton.current?.focus();
  }, [editing]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (controller.current || draft === note.title) return;
    if (!nameSchema.safeParse(draft).success) {
      setError(
        'Use 1–200 characters without surrounding spaces or control characters.',
      );
      return;
    }
    const request = new AbortController();
    controller.current = request;
    const snapshot = draft;
    setPending(true);
    setError('');
    setMessage('');
    onDirtyChange(true);
    try {
      const saved = await updateNote(
        note.id,
        { title: snapshot, expectedRevision: note.revision },
        request.signal,
      );
      if (request.signal.aborted) return;
      onSaved(saved);
      const stillDirty = latest.current !== saved.title;
      onDirtyChange(stillDirty);
      setMessage(
        stillDirty
          ? 'Title saved. Newer changes are still pending.'
          : 'Title saved.',
      );
      if (!stillDirty) setEditing(false);
    } catch (error) {
      if (!request.signal.aborted)
        setError(
          error instanceof WorkspaceRequestError
            ? error.message
            : 'The title could not be saved. Your changes are still here.',
        );
    } finally {
      if (!request.signal.aborted) {
        setPending(false);
        if (controller.current === request) controller.current = null;
      }
    }
  }
  function discard() {
    if (controller.current) return;
    latest.current = note.title;
    setDraft(note.title);
    setEditing(false);
    setError('');
    setMessage('');
    onDirtyChange(false);
  }
  return (
    <>
      <div className="note-title-row">
        <h1>{note.title}</h1>
        {!editing && (
          <button
            ref={editButton}
            type="button"
            className="workspace-retry"
            onClick={() => {
              latest.current = note.title;
              setDraft(note.title);
              setMessage('');
              setEditing(true);
            }}
          >
            Edit title
          </button>
        )}
      </div>
      {editing && (
        <form
          className="title-editor"
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <label htmlFor={`title-${note.id}`}>Note title</label>
          <input
            ref={input}
            id={`title-${note.id}`}
            value={draft}
            required
            maxLength={400}
            aria-invalid={!!error}
            aria-describedby={`title-status-${note.id}`}
            onChange={(event) => {
              const value = event.target.value;
              latest.current = value;
              setDraft(value);
              setError('');
              setMessage('');
              onDirtyChange(value !== note.title || pending);
            }}
          />
          <div className="title-actions">
            <button
              type="submit"
              className="workspace-retry title-save"
              disabled={pending || draft === note.title}
            >
              {pending ? 'Saving title…' : 'Save title'}
            </button>
            <button
              type="button"
              className="workspace-retry"
              onClick={discard}
              disabled={pending}
            >
              Discard title changes
            </button>
          </div>
          <p
            id={`title-status-${note.id}`}
            role={error ? 'alert' : 'status'}
            className="title-status"
          >
            {error ||
              message ||
              (pending
                ? 'Saving title…'
                : draft !== note.title
                  ? 'Unsaved title'
                  : 'Edit the title, then save your changes.')}
          </p>
        </form>
      )}
      {!editing && message && (
        <p role="status" className="title-status">
          {message}
        </p>
      )}
    </>
  );
}
