import { Component, lazy, Suspense, useCallback, type ReactNode } from 'react';
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
}: {
  id: ResourceId;
  tree: WorkspaceTree;
  onNavigate(id: ParentId): void;
  onDirtyChange(dirty: boolean): void;
  onNoteUpdated(note: NoteDetail): void;
}) {
  const load = useCallback((signal: AbortSignal) => getNote(id, signal), [id]);
  const { state, retry } = useLoad(load);
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
      initial={state.value}
      tree={tree}
      onNavigate={onNavigate}
      onDirtyChange={onDirtyChange}
      onNoteUpdated={onNoteUpdated}
    />
  );
}

function NoteArticle({
  initial,
  tree,
  onNavigate,
  onDirtyChange,
  onNoteUpdated,
}: {
  initial: NoteDetail;
  tree: WorkspaceTree;
  onNavigate(id: ParentId): void;
  onDirtyChange(dirty: boolean): void;
  onNoteUpdated(note: NoteDetail): void;
}) {
  const { session, state } = useNoteSession(
    initial,
    onNoteUpdated,
    onDirtyChange,
  );
  const note = state.note;
  return (
    <>
      <Breadcrumbs
        path={tree.breadcrumbs(note.folderId)}
        noteTitle={note.title}
        onNavigate={onNavigate}
      />
      <article className="note-surface">
        <p className="workspace-eyebrow">Your writing</p>
        <TitleEditor session={session} state={state} />
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
        <SaveStatus session={session} state={state} />
      </article>
    </>
  );
}
