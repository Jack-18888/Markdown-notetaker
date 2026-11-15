import { useLayoutEffect, useRef, useState } from 'react';
import { nameSchema } from '@markdown-note-taker/contracts';
import type { SaveCoordinator, SaveState } from './SaveCoordinator.js';
import './title-editor.css';

export default function TitleEditor({
  session,
  state,
  focusOnMount = false,
}: {
  session: SaveCoordinator;
  state: SaveState;
  focusOnMount?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const titleButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(focusOnMount);
  const invalid = !nameSchema.safeParse(state.title).success;

  useLayoutEffect(() => {
    if (editing) {
      const field = input.current;
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      titleButton.current?.focus();
    }
  }, [editing]);

  function finishEditing() {
    restoreFocus.current = true;
    setEditing(false);
  }

  return (
    <div className="note-title-row">
      {editing ? (
        <textarea
          ref={input}
          className="note-title-input"
          rows={1}
          maxLength={400}
          value={state.title}
          aria-label="Note title"
          aria-description="Enter to save. Escape to discard unsaved title changes."
          aria-invalid={invalid}
          aria-describedby={
            invalid && state.status === 'error'
              ? 'note-save-message'
              : undefined
          }
          onChange={(event) => session.setTitle(event.currentTarget.value)}
          onBlur={() => {
            if (!invalid) setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              const current = session.getSnapshot();
              if (current.status === 'saving') return;
              if (current.title !== current.note.title)
                session.setTitle(current.note.title);
              finishEditing();
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              const field = event.currentTarget;
              void session.flush().then((saved) => {
                if (
                  saved &&
                  session.getSnapshot().title === saved.title &&
                  input.current === field &&
                  field.ownerDocument.activeElement === field
                )
                  finishEditing();
              });
            }
          }}
        />
      ) : (
        <h1 aria-label={state.title}>
          <button
            ref={titleButton}
            type="button"
            className="note-title-button"
            title="Edit note title"
            onClick={() => setEditing(true)}
          >
            {state.title}
          </button>
        </h1>
      )}
    </div>
  );
}
