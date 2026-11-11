import type { SaveCoordinator, SaveState } from './SaveCoordinator.js';
import './save-status.css';

export default function SaveStatus({
  session,
  state,
}: {
  session: SaveCoordinator;
  state: SaveState;
}) {
  const failed = state.status === 'error' || state.status === 'conflict';
  return (
    <div className="body-save-row">
      {(state.hasBody || state.status === 'error') && (
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
          {state.status === 'saving' ? 'Saving note…' : 'Save note'}
        </button>
      )}
      <p role={failed ? 'alert' : 'status'}>
        {state.message ||
          (state.status === 'saving'
            ? 'Saving…'
            : state.dirty
              ? 'Unsaved changes'
              : 'Saved.')}
      </p>
    </div>
  );
}
