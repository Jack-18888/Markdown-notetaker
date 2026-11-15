import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteDetail } from '@markdown-note-taker/contracts';
import { getTree } from './workspace/api.js';
import Breadcrumbs from './workspace/Breadcrumbs.js';
import FolderContents from './workspace/FolderContents.js';
import FolderTree from './workspace/FolderTree.js';
import NotePanel from './workspace/NotePanel.js';
import {
  indexTree,
  type Selection,
  type WorkspaceTree,
} from './workspace/tree.js';
import { useLoad } from './workspace/useLoad.js';
import './workspace/workspace.css';
import './editor/folio.css';
import WorkspaceActions from './workspace/WorkspaceActions.js';
import NameDialog from './workspace/NameDialog.js';
import type { LifecycleAction } from './workspace/lifecycle.js';
import MoveDialog from './workspace/MoveDialog.js';
import DeleteDialog from './workspace/DeleteDialog.js';
import { useNoteTransition } from './workspace/useNoteTransition.js';
import ImportDialog from './workspace/ImportDialog.js';
import ResourceActions from './workspace/ResourceActions.js';
import FolioSearch from './workspace/FolioSearch.js';
import {
  useFolioPreferences,
  type NoteAppearance,
} from './workspace/folio-preferences.js';

const loadTree = async (signal: AbortSignal) =>
  indexTree(await getTree(signal));
const rootSelection: Selection = { kind: 'folder', id: null };

function FolioFavorites({
  tree,
  appearance,
  selection,
  onSelect,
}: {
  tree: WorkspaceTree;
  appearance: Record<string, NoteAppearance>;
  selection: Selection;
  onSelect(selection: Selection): void;
}) {
  const favorites = [...tree.notes.values()].filter(
    (note) => appearance[note.id]?.favorite,
  );
  if (!favorites.length) return null;
  return (
    <section className="folio-favorites" aria-label="Favorites">
      <h2>Favorites</h2>
      <ul>
        {favorites.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              className="quiet-button"
              aria-current={
                selection.kind === 'note' && selection.id === note.id
                  ? 'page'
                  : undefined
              }
              onClick={() => onSelect({ kind: 'note', id: note.id })}
            >
              <span aria-hidden="true">{appearance[note.id]?.icon ?? '✦'}</span>{' '}
              {note.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function App() {
  const { state, retry, update } = useLoad(loadTree);
  const [selection, setSelection] = useState<Selection>(rootSelection);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [noteEpoch, setNoteEpoch] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const appearance = useFolioPreferences();
  const loadedNote = useRef<NoteDetail | null>(null);
  const [unsavedNote, setUnsavedNote] = useState(false);
  const transition = useNoteTransition();
  useEffect(() => {
    if (!unsavedNote) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedNote]);
  const main = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const focusSidebar = useRef(false);
  useEffect(() => {
    if (sidebarOpen && focusSidebar.current && sidebar.current) {
      sidebar.current.scrollTop = 0;
      sidebar.current
        .querySelector<HTMLButtonElement>('.folder-tree button')
        ?.focus({ preventScroll: true });
      focusSidebar.current = false;
    }
  }, [sidebarOpen]);
  const focusSelection = useRef(false);
  useEffect(() => {
    if (focusSelection.current) {
      if (main.current) {
        main.current.scrollTop = 0;
        main.current.focus({ preventScroll: true });
      }
      focusSelection.current = false;
    }
  }, [selection]);
  const tree = state.status === 'ready' ? state.value : null;
  useEffect(() => {
    if (!tree || action) return;
    const search = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', search);
    return () => window.removeEventListener('keydown', search);
  }, [tree, action]);
  const missing = tree !== null && !tree.has(selection);
  const active = missing ? rootSelection : selection;
  const activeFolder =
    active.kind === 'folder' && active.id ? tree?.folders.get(active.id) : null;

  function closeSidebar() {
    setSidebarOpen(false);
    sidebarToggle.current?.focus();
  }

  function select(next: Selection) {
    if (next.kind === selection.kind && next.id === selection.id) {
      transition.cancel();
      return;
    }
    if (!tree || !tree.has(next)) return;
    void transition.run(() => reveal(next, tree));
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
    void transition.run(() => retry());
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

  function openAction(next: LifecycleAction) {
    void transition.run((saved) => {
      const current =
        saved &&
        'target' in next &&
        next.target.kind === 'note' &&
        next.target.value.id === saved.id
          ? { ...next, target: { kind: 'note' as const, value: saved } }
          : next;
      setAction(current);
    });
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
    <div
      className="workspace"
      data-sidebar-open={sidebarOpen}
      data-theme={appearance.state.theme}
    >
      <a className="skip-link" href="#workspace-content">
        Skip to notes
      </a>
      <header className="workspace-header">
        <div className="workspace-identity">
          <button
            ref={sidebarToggle}
            type="button"
            className="quiet-button sidebar-toggle"
            aria-label={sidebarOpen ? 'Hide folders' : 'Show folders'}
            aria-expanded={sidebarOpen}
            aria-controls="workspace-sidebar"
            onClick={() => {
              if (sidebarOpen) closeSidebar();
              else {
                focusSidebar.current = true;
                setSidebarOpen(true);
              }
            }}
          >
            <span aria-hidden="true" className="sidebar-toggle-icon" />
            Folders
          </button>
          <span className="workspace-brand">
            <span aria-hidden="true">✦</span> Folio
          </span>
          <button
            type="button"
            className="quiet-button folio-theme"
            aria-label="Dark theme"
            aria-pressed={appearance.state.theme === 'dark'}
            onClick={appearance.toggleTheme}
          >
            <span aria-hidden="true">
              {appearance.state.theme === 'dark' ? '☀' : '☾'}
            </span>
          </button>
        </div>
        <div className="workspace-context" ref={setHeader}>
          {tree && active.kind === 'folder' && (
            <>
              <Breadcrumbs
                path={tree.breadcrumbs(active.id)}
                onNavigate={(id) => select({ kind: 'folder', id })}
              />
              {activeFolder && (
                <ResourceActions
                  target={{ kind: 'folder', value: activeFolder }}
                  onAction={openAction}
                />
              )}
            </>
          )}
        </div>
      </header>
      <aside
        id="workspace-sidebar"
        className="workspace-sidebar"
        aria-label="Folders"
        ref={sidebar}
        hidden={!sidebarOpen}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeSidebar();
          }
        }}
      >
        {tree && (
          <button
            type="button"
            className="quiet-button folio-search-trigger"
            onClick={() => setSearchOpen(true)}
          >
            <span aria-hidden="true">⌕</span> Quick search <kbd>Ctrl K</kbd>
          </button>
        )}
        {tree && (
          <WorkspaceActions
            selection={active}
            note={
              active.kind === 'note' && loadedNote.current?.id === active.id
                ? loadedNote.current
                : null
            }
            onAction={openAction}
            onRefresh={refresh}
          />
        )}
        {tree && (
          <FolioFavorites
            tree={tree}
            appearance={appearance.state.notes}
            selection={active}
            onSelect={select}
          />
        )}
        {tree && (
          <FolderTree
            tree={tree}
            selection={active}
            expanded={expanded}
            appearance={appearance.state.notes}
            onSelect={select}
            onToggle={toggle}
          />
        )}
      </aside>
      <main
        id="workspace-content"
        className="workspace-main"
        tabIndex={-1}
        ref={main}
      >
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
              <FolderContents tree={tree} id={active.id} onSelect={select} />
            ) : (
              <NotePanel
                key={`${active.id}:${noteEpoch}`}
                id={active.id}
                tree={tree}
                header={header}
                transitionState={transition.state}
                appearance={appearance.state.notes[active.id] ?? {}}
                onAppearance={(patch) =>
                  appearance.updateNoteAppearance(active.id, patch)
                }
                onAction={openAction}
                onDirtyChange={setUnsavedNote}
                onNoteUpdated={noteUpdated}
                onSession={transition.register}
                onRecoveryCopy={(note, signal) =>
                  commitAction({ kind: 'note', id: note.id }, signal)
                }
                onNavigate={(id) => select({ kind: 'folder', id })}
              />
            )}
          </>
        )}
      </main>
      {searchOpen && tree && (
        <FolioSearch
          tree={tree}
          onClose={() => setSearchOpen(false)}
          onSelect={(note) => {
            setSearchOpen(false);
            select({ kind: 'note', id: note.id });
          }}
        />
      )}
      {action &&
        tree &&
        (action.kind === 'delete' ? (
          <DeleteDialog
            action={action}
            tree={tree}
            onCommit={commitAction}
            onClose={closeAction}
          />
        ) : action.kind === 'move' ? (
          <MoveDialog
            action={action}
            tree={tree}
            onCommit={commitAction}
            onClose={closeAction}
          />
        ) : action.kind === 'import' ? (
          <ImportDialog
            parentId={action.parentId}
            tree={tree}
            onCommit={commitAction}
            onClose={closeAction}
          />
        ) : (
          <NameDialog
            action={action}
            tree={tree}
            onCommit={commitAction}
            onClose={closeAction}
          />
        ))}
    </div>
  );
}
