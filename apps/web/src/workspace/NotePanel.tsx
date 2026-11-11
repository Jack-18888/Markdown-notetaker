import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  const [note, setNote] = useState(initial);
  const dirty = useRef({ title: false, body: false });
  const [titleSaving, setTitleSaving] = useState(false);
  const [bodySaving, setBodySaving] = useState(false);
  const titleDirty = useCallback(
    (value: boolean) => {
      dirty.current.title = value;
      onDirtyChange(value || dirty.current.body);
    },
    [onDirtyChange],
  );
  const bodyDirty = useCallback(
    (value: boolean) => {
      dirty.current.body = value;
      onDirtyChange(value || dirty.current.title);
    },
    [onDirtyChange],
  );
  function saved(next: NoteDetail) {
    setNote(next);
    onNoteUpdated(next);
  }
  useEffect(() => {
    onNoteUpdated(initial);
  }, [initial, onNoteUpdated]);
  return (
    <>
      <Breadcrumbs
        path={tree.breadcrumbs(note.folderId)}
        noteTitle={note.title}
        onNavigate={onNavigate}
      />
      <article className="note-surface">
        <p className="workspace-eyebrow">Your writing</p>
        <TitleEditor
          note={note}
          onDirtyChange={titleDirty}
          saveDisabled={bodySaving}
          onSavingChange={setTitleSaving}
          onSaved={saved}
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
            <NoteContent
              note={note}
              saveDisabled={titleSaving}
              onSaved={saved}
              onDirtyChange={bodyDirty}
              onSavingChange={setBodySaving}
            />
          </Suspense>
        </PreviewBoundary>
      </article>
    </>
  );
}
