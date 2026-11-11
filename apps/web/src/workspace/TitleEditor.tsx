import { useEffect, useRef, useState } from 'react';
import { nameSchema } from '@markdown-note-taker/contracts';
import type { SaveCoordinator, SaveState } from './SaveCoordinator.js';
import './title-editor.css';

export default function TitleEditor({
  session,
  state,
}: {
  session: SaveCoordinator;
  state: SaveState;
}) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (editing) {
      opened.current = true;
      input.current?.focus();
    } else if (opened.current) editButton.current?.focus();
  }, [editing]);
  const pending = state.status === 'saving';
  return (
    <>
      <div className="note-title-row">
        <h1>{state.note.title}</h1>
        {!editing && (
          <button
            ref={editButton}
            type="button"
            className="workspace-retry"
            onClick={() => setEditing(true)}
          >
            Edit title
          </button>
        )}
      </div>
      {editing && (
        <form
          className="title-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void session.flush().then((saved) => {
              if (saved && session.getSnapshot().title === saved.title)
                setEditing(false);
            });
          }}
        >
          <label htmlFor={`title-${state.note.id}`}>Note title</label>
          <input
            ref={input}
            id={`title-${state.note.id}`}
            value={state.title}
            required
            maxLength={400}
            aria-invalid={!nameSchema.safeParse(state.title).success}
            aria-describedby={`title-status-${state.note.id}`}
            onChange={(event) => session.setTitle(event.target.value)}
          />
          <div className="title-actions">
            <button
              type="submit"
              className="workspace-retry title-save"
              disabled={
                pending ||
                state.title === state.note.title ||
                state.status === 'conflict'
              }
            >
              {pending ? 'Saving title…' : 'Save title'}
            </button>
            <button
              type="button"
              className="workspace-retry"
              disabled={pending}
              onClick={() => {
                session.setTitle(state.note.title);
                setEditing(false);
              }}
            >
              Discard title changes
            </button>
          </div>
          <p id={`title-status-${state.note.id}`} className="title-status">
            Title changes save automatically. Save title saves all pending note
            changes now.
          </p>
        </form>
      )}
    </>
  );
}
