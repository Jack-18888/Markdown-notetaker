import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  NoteDetail,
  ParentId,
  ResourceId,
} from '@markdown-note-taker/contracts';
import SourceFallback from '../editor/SourceFallback.js';
import { getNote } from './api.js';
import Breadcrumbs from './Breadcrumbs.js';
import type { WorkspaceTree } from './tree.js';
import { useLoad } from './useLoad.js';
import TitleEditor from './TitleEditor.js';
import SaveStatus from './SaveStatus.js';
import { useNoteSession } from './useNoteSession.js';
import type { SaveCoordinator } from './SaveCoordinator.js';
import ConflictRecovery from './ConflictRecovery.js';
import ExportMarkdown from './ExportMarkdown.js';
import ResourceActions from './ResourceActions.js';
import type { LifecycleAction } from './lifecycle.js';
import type { NoteTransitionState } from './useNoteTransition.js';
import { noteIcons, type NoteAppearance } from './folio-preferences.js';

const NoteContent = lazy(() => import('./NoteContent.js'));

class PreviewBoundary extends Component<
  { session: SaveCoordinator; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <SourceFallback session={this.props.session} />
    ) : (
      this.props.children
    );
  }
}

export default function NotePanel({
  id,
  tree,
  header,
  transitionState,
  appearance,
  onAppearance,
  onAction,
  onNavigate,
  onDirtyChange,
  onNoteUpdated,
  onSession,
  onRecoveryCopy,
}: {
  id: ResourceId;
  tree: WorkspaceTree;
  header: HTMLDivElement | null;
  transitionState: NoteTransitionState;
  appearance: NoteAppearance;
  onAppearance(patch: NoteAppearance): void;
  onAction(action: LifecycleAction): void;
  onNavigate(id: ParentId): void;
  onDirtyChange(dirty: boolean): void;
  onNoteUpdated(note: NoteDetail): void;
  onSession(session: SaveCoordinator | null): void;
  onRecoveryCopy(note: NoteDetail, signal: AbortSignal): Promise<void>;
}) {
  const load = useCallback((signal: AbortSignal) => getNote(id, signal), [id]);
  const { state, retry } = useLoad(load);
  const [replacement, setReplacement] = useState<{
    note: NoteDetail;
    epoch: number;
  } | null>(null);
  const entry = tree.notes.get(id);
  const pendingBreadcrumb =
    header && entry
      ? createPortal(
          <Breadcrumbs
            path={tree.breadcrumbs(entry.folderId)}
            noteTitle={entry.title}
            onNavigate={onNavigate}
          />,
          header,
        )
      : null;
  if (state.status === 'loading')
    return (
      <>
        {pendingBreadcrumb}
        <p role="status" className="workspace-message">
          Loading note…
        </p>
      </>
    );
  if (state.status === 'error')
    return (
      <>
        {pendingBreadcrumb}
        <div role="alert" className="workspace-message">
          <h1>Could not open this note.</h1>
          <p>
            {state.error?.message ?? 'The note could not be loaded. Try again.'}
          </p>
          <button type="button" className="workspace-retry" onClick={retry}>
            Retry note
          </button>
        </div>
      </>
    );
  return (
    <NoteArticle
      key={replacement?.epoch ?? 0}
      initial={replacement?.note ?? state.value}
      focusTitle={replacement !== null}
      tree={tree}
      header={header}
      transitionState={transitionState}
      appearance={appearance}
      onAppearance={onAppearance}
      onAction={onAction}
      onNavigate={onNavigate}
      onDirtyChange={onDirtyChange}
      onNoteUpdated={onNoteUpdated}
      onSession={onSession}
      onReload={(note) =>
        setReplacement((current) => ({
          note,
          epoch: (current?.epoch ?? 0) + 1,
        }))
      }
      onRecoveryCopy={onRecoveryCopy}
    />
  );
}

function NoteArticle({
  initial,
  focusTitle,
  tree,
  header,
  transitionState,
  appearance,
  onAppearance,
  onAction,
  onNavigate,
  onDirtyChange,
  onNoteUpdated,
  onSession,
  onReload,
  onRecoveryCopy,
}: {
  initial: NoteDetail;
  focusTitle: boolean;
  tree: WorkspaceTree;
  header: HTMLDivElement | null;
  transitionState: NoteTransitionState;
  appearance: NoteAppearance;
  onAppearance(patch: NoteAppearance): void;
  onAction(action: LifecycleAction): void;
  onNavigate(id: ParentId): void;
  onDirtyChange(dirty: boolean): void;
  onNoteUpdated(note: NoteDetail): void;
  onSession(session: SaveCoordinator | null): void;
  onReload(note: NoteDetail): void;
  onRecoveryCopy(note: NoteDetail, signal: AbortSignal): Promise<void>;
}) {
  const { session, state } = useNoteSession(
    initial,
    onNoteUpdated,
    onDirtyChange,
  );
  const [exportMessage, setExportMessage] = useState('');
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    onSession(session);
    return () => onSession(null);
  }, [session, onSession]);
  const note = state.note;
  return (
    <>
      {header &&
        createPortal(
          <>
            <Breadcrumbs
              path={tree.breadcrumbs(note.folderId)}
              noteTitle={note.title}
              onNavigate={onNavigate}
            />
            <div className="note-header-actions">
              <div ref={setToolbar} />
              <button
                type="button"
                className="quiet-button folio-favorite"
                aria-label="Favorite note"
                aria-pressed={Boolean(appearance.favorite)}
                onClick={() => onAppearance({ favorite: !appearance.favorite })}
              >
                <span aria-hidden="true">
                  {appearance.favorite ? '★' : '☆'}
                </span>
              </button>
              <SaveStatus
                session={session}
                state={state}
                transitionState={transitionState}
                exportMessage={exportMessage}
              >
                {state.status === 'conflict' && (
                  <ConflictRecovery
                    session={session}
                    onReload={onReload}
                    onCopy={onRecoveryCopy}
                  />
                )}
              </SaveStatus>
              <ResourceActions
                target={{ kind: 'note', value: note }}
                onAction={onAction}
              >
                <button
                  type="button"
                  onClick={() =>
                    onAppearance({
                      font: appearance.font === 'serif' ? 'sans' : 'serif',
                    })
                  }
                >
                  {appearance.font === 'serif'
                    ? 'Use sans-serif type'
                    : 'Use serif type'}
                </button>
                <ExportMarkdown
                  session={session}
                  onMessage={setExportMessage}
                />
              </ResourceActions>
            </div>
          </>,
          header,
        )}
      <article className="note-surface" data-font={appearance.font ?? 'sans'}>
        <details className="folio-icon-menu no-print">
          <summary aria-label="Change note icon" title="Change note icon">
            {appearance.icon ?? '◈'}
          </summary>
          <div>
            {noteIcons.map((icon) => (
              <button
                type="button"
                key={icon}
                aria-label={'Set note icon ' + icon}
                onClick={(event) => {
                  onAppearance({ icon });
                  const details = event.currentTarget.closest('details');
                  if (details) {
                    details.open = false;
                    details.querySelector('summary')?.focus();
                  }
                }}
              >
                {icon}
              </button>
            ))}
          </div>
        </details>
        <TitleEditor
          session={session}
          state={state}
          focusOnMount={focusTitle}
        />
        {note.folderId !== null && !tree.folders.has(note.folderId) && (
          <p role="status" className="note-feedback">
            This note's location changed. Refresh the workspace to update its
            path.
          </p>
        )}
        <PreviewBoundary key={note.id} session={session}>
          <Suspense
            fallback={
              <p role="status" className="note-feedback workspace-message">
                Preparing note…
              </p>
            }
          >
            <NoteContent
              source={initial.content}
              session={session}
              toolbar={toolbar}
            />
          </Suspense>
        </PreviewBoundary>
      </article>
    </>
  );
}
