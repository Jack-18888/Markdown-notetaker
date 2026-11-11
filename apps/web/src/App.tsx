import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applicationName,
  type NoteDetail,
} from '@markdown-note-taker/contracts';
import { getTree } from './workspace/api.js';
import Breadcrumbs from './workspace/Breadcrumbs.js';
import FolderContents from './workspace/FolderContents.js';
import FolderTree from './workspace/FolderTree.js';
import NotePanel from './workspace/NotePanel.js';
import { indexTree, type Selection } from './workspace/tree.js';
import { useLoad } from './workspace/useLoad.js';
import './workspace/workspace.css';
import WorkspaceActions from './workspace/WorkspaceActions.js';
import NameDialog from './workspace/NameDialog.js';
import type { NameAction } from './workspace/lifecycle.js';

const loadTree = async (signal: AbortSignal) =>
  indexTree(await getTree(signal));
const rootSelection: Selection = { kind: 'folder', id: null };

export default function App() {
  const { state, retry, update } = useLoad(loadTree);
  const [selection, setSelection] = useState<Selection>(rootSelection);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [action, setAction] = useState<NameAction | null>(null);
  const [noteEpoch, setNoteEpoch] = useState(0);
  const loadedNote = useRef<NoteDetail | null>(null);
  const [unsavedTitle, setUnsavedTitle] = useState(false);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  useEffect(() => {
    if (!unsavedTitle) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedTitle]);
  const main = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const focusSidebar = useRef(false);
  useEffect(() => {
    if (sidebarOpen && focusSidebar.current && sidebar.current) {
      sidebar.current.scrollTop = 0;
      sidebar.current.scrollIntoView({ block: 'start' });
      sidebar.current
        .querySelector<HTMLButtonElement>('.folder-tree button')
        ?.focus({ preventScroll: true });
      focusSidebar.current = false;
    }
  }, [sidebarOpen]);
  const focusSelection = useRef(false);
  useEffect(() => {
    if (focusSelection.current) {
      main.current?.focus();
      focusSelection.current = false;
    }
  }, [selection]);
  const tree = state.status === 'ready' ? state.value : null;
  const missing = tree !== null && !tree.has(selection);
  const active = missing ? rootSelection : selection;

  function select(next: Selection) {
    if (next.kind === selection.kind && next.id === selection.id) return;
    if (unsavedTitle) {
      setNavigationBlocked(true);
      return;
    }
    setNavigationBlocked(false);
    if (!tree || !tree.has(next)) return;
    reveal(next, tree);
  }
  function reveal(next: Selection, tree: ReturnType<typeof indexTree>) {
    loadedNote.current = null;
    focusSelection.current = true;
    setSelection(next);
    const parent =
      next.kind === 'folder'
        ? next.id
        : (tree.notes.get(next.id)?.folderId ?? null);
    setExpanded(
      (current) =>
        new Set([
          ...current,
          ...tree.breadcrumbs(parent).map((folder) => folder.id),
        ]),
    );
    if (next.kind === 'note' && window.matchMedia('(max-width: 760px)').matches)
      setSidebarOpen(false);
  }
  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function refresh() {
    if (unsavedTitle) {
      setNavigationBlocked(true);
      return;
    }
    setNavigationBlocked(false);
    retry();
  }
  const noteUpdated = useCallback(
    function noteUpdated(note: NoteDetail) {
      loadedNote.current = note;
      const { id, title, folderId, revision, createdAt, updatedAt } = note;
      update((tree) => {
        if (folderId !== null && !tree.folders.has(folderId)) return tree;
        return indexTree({
          folders: [...tree.folders.values()],
          notes: [...tree.notes.values()].map((current) =>
            current.id === id
              ? { id, title, folderId, revision, createdAt, updatedAt }
              : current,
          ),
        });
      });
    },
    [update],
  );

  function openAction(next: NameAction) {
    if (unsavedTitle) {
      setNavigationBlocked(true);
      return;
    }
    setNavigationBlocked(false);
    setAction(next);
  }
  async function commitAction(next: Selection, signal: AbortSignal) {
    const snapshot = await loadTree(signal);
    if (signal.aborted) return;
    update(() => snapshot);
    setNoteEpoch((value) => value + 1);
    reveal(next, snapshot);
  }
  function closeAction(refreshSelection?: Selection) {
    setAction(null);
    if (refreshSelection) {
      setSelection(refreshSelection);
      retry();
    }
  }

  return (
    <div className="workspace" data-sidebar-open={sidebarOpen}>
      <a className="skip-link" href="#workspace-content">
        Skip to notes
      </a>
      <header className="workspace-header">
        <span className="workspace-brand">{applicationName}</span>
        <div className="workspace-actions">
          <button
            type="button"
            aria-label={sidebarOpen ? 'Hide folders' : 'Show folders'}
            aria-expanded={sidebarOpen}
            aria-controls="workspace-sidebar"
            onClick={() => {
              focusSidebar.current = !sidebarOpen;
              setSidebarOpen((value) => !value);
            }}
          >
            Folders
          </button>
          <button
            type="button"
            aria-label="Refresh workspace"
            onClick={refresh}
          >
            Refresh
          </button>
        </div>
      </header>
      <aside
        id="workspace-sidebar"
        className="workspace-sidebar"
        ref={sidebar}
        hidden={!sidebarOpen}
      >
        <p className="sidebar-caption">Personal workspace</p>
        {tree && (
          <WorkspaceActions
            tree={tree}
            selection={active}
            note={
              active.kind === 'note' && loadedNote.current?.id === active.id
                ? loadedNote.current
                : null
            }
            onAction={openAction}
          />
        )}
        {tree && (
          <FolderTree
            tree={tree}
            selection={active}
            expanded={expanded}
            onSelect={select}
            onToggle={toggle}
          />
        )}
        <p className="workspace-status" role="status">
          {state.status === 'ready'
            ? 'Local workspace ready'
            : state.status === 'loading'
              ? 'Loading workspace…'
              : 'Workspace unavailable'}
        </p>
      </aside>
      <main
        id="workspace-content"
        className="workspace-main"
        tabIndex={-1}
        ref={main}
      >
        {navigationBlocked && unsavedTitle && (
          <p role="alert" className="workspace-message">
            Save or discard the title changes before leaving this note.
          </p>
        )}
        {state.status === 'loading' && (
          <p className="workspace-message">Loading your workspace…</p>
        )}
        {state.status === 'error' && (
          <div role="alert" className="workspace-message">
            <h1>Could not load your workspace.</h1>
            <p>
              {state.error?.message ??
                'The workspace hierarchy could not be loaded. Try again.'}
            </p>
            <button type="button" className="workspace-retry" onClick={retry}>
              Retry workspace
            </button>
          </div>
        )}
        {tree && (
          <>
            {missing && (
              <p role="status" className="workspace-message">
                The selected item is no longer available. Showing the workspace.
              </p>
            )}
            {active.kind === 'folder' ? (
              <>
                <Breadcrumbs
                  path={tree.breadcrumbs(active.id)}
                  onNavigate={(id) => select({ kind: 'folder', id })}
                />
                <FolderContents tree={tree} id={active.id} onSelect={select} />
              </>
            ) : (
              <NotePanel
                key={`${active.id}:${noteEpoch}`}
                id={active.id}
                tree={tree}
                onDirtyChange={setUnsavedTitle}
                onNoteUpdated={noteUpdated}
                onNavigate={(id) => select({ kind: 'folder', id })}
              />
            )}
          </>
        )}
      </main>
      {action && tree && (
        <NameDialog
          action={action}
          tree={tree}
          onCommit={commitAction}
          onClose={closeAction}
        />
      )}
    </div>
  );
}
