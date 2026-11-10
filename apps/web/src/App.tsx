import { useEffect, useRef, useState } from 'react';
import { applicationName } from '@markdown-note-taker/contracts';
import { getTree } from './workspace/api.js';
import Breadcrumbs from './workspace/Breadcrumbs.js';
import FolderContents from './workspace/FolderContents.js';
import FolderTree from './workspace/FolderTree.js';
import NotePanel from './workspace/NotePanel.js';
import { indexTree, type Selection } from './workspace/tree.js';
import { useLoad } from './workspace/useLoad.js';
import './workspace/workspace.css';

const loadTree = async (signal: AbortSignal) =>
  indexTree(await getTree(signal));
const rootSelection: Selection = { kind: 'folder', id: null };

export default function App() {
  const { state, retry } = useLoad(loadTree);
  const [selection, setSelection] = useState<Selection>(rootSelection);
  const [expanded, setExpanded] = useState(new Set<string>());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const main = useRef<HTMLElement>(null);
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
    if (!tree || !tree.has(next)) return;
    focusSelection.current = true;
    setSelection(next);
    const parent =
      next.kind === 'folder' ? next.id : tree.notes.get(next.id)!.folderId;
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
            onClick={() => setSidebarOpen((value) => !value)}
          >
            Folders
          </button>
          <button type="button" aria-label="Refresh workspace" onClick={retry}>
            Refresh
          </button>
        </div>
      </header>
      <aside
        id="workspace-sidebar"
        className="workspace-sidebar"
        hidden={!sidebarOpen}
      >
        <p className="sidebar-caption">Personal workspace</p>
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
                key={active.id}
                id={active.id}
                tree={tree}
                onNavigate={(id) => select({ kind: 'folder', id })}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
