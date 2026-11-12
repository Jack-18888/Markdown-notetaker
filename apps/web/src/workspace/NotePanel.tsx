import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type {
  NoteDetail,
  ParentId,
  ResourceId,
} from '@markdown-note-taker/contracts';
import { createPortal } from 'react-dom';
import type { LifecycleAction } from './lifecycle.js';
import ActionMenu from './ActionMenu.js';
import ResourceActions from './ResourceActions.js';
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

const NoteContent = lazy(() => import('./NoteContent.js'));

class PreviewBoundary extends Component<
  { source: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <SourceFallback
        document={{
          mode: 'source',
          source: this.props.source,
          reason: 'conversion-failed',
        }}
      />
    ) : (
      this.props.children
    );
  }
}

export default function NotePanel({
  id,
  tree,
  onNavigate,
  onDirtyChange,
  onNoteUpdated,
  onSession,
  onRecoveryCopy,
  header,
  onReady,
  onAction,
}: {
  id: ResourceId;
  tree: WorkspaceTree;
  onNavigate(id: ParentId): void;
  onDirtyChange(dirty: boolean): void;
  onNoteUpdated(note: NoteDetail): void;
  onSession(session: SaveCoordinator | null): void;
  onRecoveryCopy(note: NoteDetail, signal: AbortSignal): Promise<void>;
  header: HTMLElement | null;
  onReady(): void;
  onAction(action: LifecycleAction): void;
}) {
  const load = useCallback((signal: AbortSignal) => getNote(id, signal), [id]);
  const { state, retry } = useLoad(load);
  const [replacement, setReplacement] = useState<{
    note: NoteDetail;
    epoch: number;
  } | null>(null);
  if (state.status === 'loading')
    return (
      <p role="status" className="workspace-message">
        Loading note…
      </p>
    );
  if (state.status === 'error')
    return (
      <div role="alert" className="workspace-message">
        <h1>Could not open this note.</h1>
        <p>
          {state.error?.message ?? 'The note could not be loaded. Try again.'}
        </p>
        <button type="button" className="workspace-retry" onClick={retry}>
          Retry note
        </button>
      </div>
    );
  return (
    <NoteArticle
      key={replacement?.epoch ?? 0}
      initial={replacement?.note ?? state.value}
      focusTitle={replacement !== null}
      tree={tree}
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
      header={header}
      onReady={onReady}
      onAction={onAction}
    />
  );
}

function NoteArticle({
  initial,
  focusTitle,
  tree,
  onNavigate,
  onDirtyChange,
  onNoteUpdated,
  onSession,
  onReload,
  onRecoveryCopy,
  header,
  onReady,
  onAction,
}: {
  initial: NoteDetail;
  focusTitle: boolean;
  tree: WorkspaceTree;
  onNavigate(id: ParentId): void;
  onDirtyChange(dirty: boolean): void;
  onNoteUpdated(note: NoteDetail): void;
  onSession(session: SaveCoordinator | null): void;
  onReload(note: NoteDetail): void;
  onRecoveryCopy(note: NoteDetail, signal: AbortSignal): Promise<void>;
  header: HTMLElement | null;
  onReady(): void;
  onAction(action: LifecycleAction): void;
}) {
  const { session, state } = useNoteSession(
    initial,
    onNoteUpdated,
    onDirtyChange,
  );
  useEffect(() => {
    onSession(session);
    return () => onSession(null);
  }, [session, onSession]);
  const note = state.note;
  useEffect(onReady, [onReady]);
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
            <SaveStatus session={session} state={state} compact />
            <ActionMenu label="Note actions">
              <SaveStatus session={session} state={state} actionsOnly />
              <ResourceActions
                target={{ kind: 'note', value: note }}
                onAction={onAction}
              />
              <ExportMarkdown session={session} />
            </ActionMenu>
          </>,
          header,
        )}
      <article className="note-surface">
        <TitleEditor
          session={session}
          state={state}
          focusOnMount={focusTitle}
        />
        {note.folderId !== null && !tree.folders.has(note.folderId) && (
          <p role="status">
            This note's location changed. Refresh the workspace to update its
            path.
          </p>
        )}
        <PreviewBoundary key={note.id} source={note.content}>
          <Suspense
            fallback={
              <p role="status" className="workspace-message">
                Preparing note…
              </p>
            }
          >
            <NoteContent source={initial.content} session={session} />
          </Suspense>
        </PreviewBoundary>
        {(state.status === 'error' || state.status === 'conflict') && (
          <div id="save-recovery" tabIndex={-1}>
            <SaveStatus session={session} state={state} />
          </div>
        )}
        {state.status === 'conflict' && (
          <ConflictRecovery
            session={session}
            onReload={onReload}
            onCopy={onRecoveryCopy}
          />
        )}
      </article>
    </>
  );
}
