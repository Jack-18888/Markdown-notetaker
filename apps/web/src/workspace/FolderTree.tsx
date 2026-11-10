import type { ParentId, ResourceId } from '@markdown-note-taker/contracts';
import type { Selection, WorkspaceTree } from './tree.js';

interface Props {
  tree: WorkspaceTree;
  selection: Selection;
  expanded: ReadonlySet<ResourceId>;
  onToggle(id: ResourceId): void;
  onSelect(selection: Selection): void;
}

export default function FolderTree({
  tree,
  selection,
  expanded,
  onToggle,
  onSelect,
}: Props) {
  function children(parentId: ParentId) {
    const contents = tree.contents.get(parentId)!;
    return (
      <>
        {contents.folders.map((folder) => (
          <li key={folder.id}>
            <div className="folder-row">
              <button
                type="button"
                className="folder-disclosure"
                aria-label={`${expanded.has(folder.id) ? 'Collapse' : 'Expand'} ${folder.name}`}
                aria-expanded={expanded.has(folder.id)}
                aria-controls={`children-${folder.id}`}
                onClick={() => onToggle(folder.id)}
              >
                <span aria-hidden="true">
                  {expanded.has(folder.id) ? '⌄' : '›'}
                </span>
              </button>
              <button
                type="button"
                className="folder-link"
                aria-current={
                  selection.kind === 'folder' && selection.id === folder.id
                    ? 'page'
                    : undefined
                }
                onClick={() => onSelect({ kind: 'folder', id: folder.id })}
              >
                <span className="item-symbol" aria-hidden="true">
                  ▱
                </span>
                <span>{folder.name}</span>
              </button>
            </div>
            <ul id={`children-${folder.id}`} hidden={!expanded.has(folder.id)}>
              {expanded.has(folder.id) &&
                (contents.folders.length || contents.notes.length ? (
                  children(folder.id)
                ) : (
                  <li className="tree-empty">Empty folder</li>
                ))}
            </ul>
          </li>
        ))}
        {contents.notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              className="note-link"
              aria-current={
                selection.kind === 'note' && selection.id === note.id
                  ? 'page'
                  : undefined
              }
              onClick={() => onSelect({ kind: 'note', id: note.id })}
            >
              <span className="item-symbol" aria-hidden="true">
                ≡
              </span>
              <span>{note.title}</span>
            </button>
          </li>
        ))}
      </>
    );
  }
  return (
    <nav aria-label="Workspace folders" className="folder-tree">
      <button
        type="button"
        className="workspace-root"
        aria-current={
          selection.kind === 'folder' && selection.id === null
            ? 'page'
            : undefined
        }
        onClick={() => onSelect({ kind: 'folder', id: null })}
      >
        Workspace
      </button>
      <ul>{children(null)}</ul>
    </nav>
  );
}
