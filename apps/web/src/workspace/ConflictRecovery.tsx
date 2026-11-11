import { useRef, useState } from 'react';
import { nameSchema, type NoteDetail } from '@markdown-note-taker/contracts';
import { createNote, getNote, WorkspaceRequestError } from './api.js';
import type { SaveCoordinator } from './SaveCoordinator.js';
import Modal from './Modal.js';
import { useOperation } from './useOperation.js';

export default function ConflictRecovery({
  session,
  onReload,
  onCopy,
}: {
  session: SaveCoordinator;
  onReload(note: NoteDetail): void;
  onCopy(note: NoteDetail, signal: AbortSignal): Promise<void>;
}) {
  const [choice, setChoice] = useState<'reload' | 'copy' | null>(null);
  return (
    <div className="conflict-recovery">
      <p>
        Your changes are kept here. Reload the saved note or preserve your local
        version as a new note.
      </p>
      <div className="title-actions">
        <button
          type="button"
          className="workspace-retry"
          onClick={() => setChoice('reload')}
        >
          Reload saved note
        </button>
        <button
          type="button"
          className="dialog-primary"
          onClick={() => setChoice('copy')}
        >
          Save as new note
        </button>
      </div>
      {choice && (
        <RecoveryDialog
          choice={choice}
          session={session}
          onReload={onReload}
          onCopy={onCopy}
          onClose={() => setChoice(null)}
        />
      )}
    </div>
  );
}

function RecoveryDialog({
  choice,
  session,
  onReload,
  onCopy,
  onClose,
}: {
  choice: 'reload' | 'copy';
  session: SaveCoordinator;
  onReload(note: NoteDetail): void;
  onCopy(note: NoteDetail, signal: AbortSignal): Promise<void>;
  onClose(): void;
}) {
  const snapshot = session.getSnapshot();
  const [title, setTitle] = useState(
    Array.from(snapshot.title).slice(0, 193).join('') + ' (copy)',
  );
  const [validation, setValidation] = useState('');
  const saved = useRef<NoteDetail | null>(null);
  const operation = useOperation(
    async (signal) => {
      if (choice === 'reload')
        saved.current = await getNote(snapshot.note.id, signal);
      else {
        let content: string;
        try {
          content = session.localContent();
        } catch {
          throw new WorkspaceRequestError(
            'INVALID_RESPONSE',
            'This edit cannot be copied safely. Undo the last change and try again.',
          );
        }
        saved.current = await createNote(title, null, signal, content);
      }
      return { kind: 'note', id: saved.current.id };
    },
    {
      async onCommit(_selection, signal) {
        if (choice === 'copy') await onCopy(saved.current!, signal);
        else onReload(saved.current!);
      },
      onClose,
    },
  );
  return (
    <Modal
      title={
        choice === 'reload' ? 'Discard local changes?' : 'Save as new note'
      }
      pending={operation.pending}
      onDismiss={operation.dismiss}
    >
      <p>
        {choice === 'reload'
          ? 'Reloading replaces your local title and writing with the saved note. This cannot be undone.'
          : 'A copy will be created in Workspace. The original note stays unchanged.'}
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (
            choice === 'copy' &&
            !operation.saved &&
            !nameSchema.safeParse(title).success
          ) {
            setValidation(
              'Use 1–200 characters without surrounding spaces or control characters.',
            );
            return;
          }
          setValidation('');
          void operation.run();
        }}
      >
        {choice === 'copy' && (
          <>
            <label htmlFor="recovered-title">New note title</label>
            <input
              id="recovered-title"
              value={title}
              disabled={operation.pending || operation.saved}
              maxLength={400}
              aria-invalid={!!validation}
              aria-describedby="recovery-error"
              onChange={(event) => setTitle(event.target.value)}
            />
          </>
        )}
        <p id="recovery-error" role="alert" className="dialog-error">
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
              ? 'Working…'
              : operation.saved
                ? 'Retry opening note'
                : choice === 'reload'
                  ? 'Discard and reload'
                  : 'Create copy'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
