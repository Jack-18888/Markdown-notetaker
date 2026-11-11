import { Component, lazy, Suspense, useCallback, type ReactNode } from 'react';
import type { ParentId, ResourceId } from '@markdown-note-taker/contracts';
import SourceFallback from '../editor/SourceFallback.js';
import { getNote } from './api.js';
import Breadcrumbs from './Breadcrumbs.js';
import type { WorkspaceTree } from './tree.js';
import { useLoad } from './useLoad.js';

const NotePreview = lazy(() => import('./NotePreview.js'));

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
}: {
  id: ResourceId;
  tree: WorkspaceTree;
  onNavigate(id: ParentId): void;
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
  const note = state.value;
  return (
    <>
      <Breadcrumbs
        path={tree.breadcrumbs(note.folderId)}
        noteTitle={note.title}
        onNavigate={onNavigate}
      />
      <article className="note-surface">
        <p className="workspace-eyebrow">Reading view</p>
        <h1>{note.title}</h1>
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
            <NotePreview source={note.content} />
          </Suspense>
        </PreviewBoundary>
      </article>
    </>
  );
}
