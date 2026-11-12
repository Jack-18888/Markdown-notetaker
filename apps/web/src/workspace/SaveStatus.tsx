import type { SaveCoordinator, SaveState } from './SaveCoordinator.js';
import './save-status.css';

export default function SaveStatus({
  session,
  state,
  compact = false,
  actionsOnly = false,
}: {
  session: SaveCoordinator;
  state: SaveState;
  compact?: boolean;
  actionsOnly?: boolean;
}) {
  const failed = state.status === 'error' || state.status === 'conflict';
  const message =
    state.message ||
    (state.status === 'saving'
      ? 'Saving…'
      : state.dirty
        ? 'Unsaved changes'
        : 'Saved.');
  if (compact)
    return (
      <div className="header-save" role={failed ? 'alert' : 'status'}>
        {failed ? (
          <a
            href="#save-recovery"
            onClick={() => document.getElementById('save-recovery')?.focus()}
          >
            Save needs attention
          </a>
        ) : (
          message
        )}
      </div>
    );
  return (
    <div className="body-save-row">
      {(state.hasBody || state.dirty || state.status === 'error') && (
        <button
          type="button"
          className="dialog-primary"
          disabled={
            !state.dirty ||
            state.status === 'saving' ||
            state.status === 'conflict'
          }
          onClick={() => {
            void session.flush();
          }}
        >
          {state.status === 'saving'
            ? 'Saving note…'
            : failed && !actionsOnly
              ? 'Retry save'
              : 'Save note'}
        </button>
      )}
      {!actionsOnly && (
        <p role={failed ? 'alert' : 'status'}>
          {state.message ||
            (state.status === 'saving'
              ? 'Saving…'
              : state.dirty
                ? 'Unsaved changes'
                : 'Saved.')}
        </p>
      )}
    </div>
  );
}
