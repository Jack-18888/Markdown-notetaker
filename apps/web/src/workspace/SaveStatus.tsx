import { useRef, useState, type ReactNode } from 'react';
import type { SaveCoordinator, SaveState } from './SaveCoordinator.js';
import type { NoteTransitionState } from './useNoteTransition.js';
import './save-status.css';

function SaveFeedback({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="quiet-button save-issue"
        aria-expanded={open}
        aria-controls="note-save-feedback"
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      <div
        id="note-save-feedback"
        className="save-feedback"
        role="region"
        aria-label="Save details"
        hidden={!open}
        onKeyDown={(event) => {
          if (
            event.key === 'Escape' &&
            !(event.target instanceof Element && event.target.closest('dialog'))
          ) {
            event.preventDefault();
            close();
          }
        }}
      >
        <button
          type="button"
          className="quiet-button save-feedback-dismiss"
          aria-label="Dismiss save details"
          onClick={close}
        >
          ×
        </button>
        {children}
      </div>
    </>
  );
}

export default function SaveStatus({
  session,
  state,
  transitionState,
  exportMessage,
  children,
}: {
  session: SaveCoordinator;
  state: SaveState;
  transitionState: NoteTransitionState;
  exportMessage: string;
  children?: ReactNode;
}) {
  const failed = state.status === 'error' || state.status === 'conflict';
  const saveError = failed ? state.message : '';
  const transitionError =
    failed && transitionState === 'error'
      ? 'Could not continue. Your changes are still here. Retry saving or resolve the conflict, then try again.'
      : '';
  const saving = transitionState === 'saving' || state.status === 'saving';
  return (
    <div className="note-save-controls">
      <div className="note-save-indicator">
        {failed || exportMessage ? (
          <SaveFeedback
            key={saveError + transitionError + exportMessage}
            label={
              state.status === 'conflict'
                ? 'Save conflict'
                : failed
                  ? 'Save failed'
                  : 'Export failed'
            }
          >
            {saveError && (
              <p id="note-save-message" role="alert">
                {saveError}
              </p>
            )}
            {transitionError && <p role="alert">{transitionError}</p>}
            {exportMessage && <p role="alert">{exportMessage}</p>}
            {children}
          </SaveFeedback>
        ) : (
          <p role="status">
            {saving ? 'Saving…' : state.dirty ? 'Unsaved changes' : 'Saved.'}
          </p>
        )}
      </div>
      <button
        type="button"
        className="quiet-button note-save-button"
        data-hidden={
          !(state.hasBody || state.dirty || state.status === 'error')
        }
        disabled={!state.dirty || saving || state.status === 'conflict'}
        onClick={() => {
          void session.flush();
        }}
      >
        Save note
      </button>
    </div>
  );
}
