import type { ParentId } from '@markdown-note-taker/contracts';
import type { Selection, WorkspaceTree } from './tree.js';

export default function FolderContents({
  tree,
  id,
  onSelect,
}: {
  tree: WorkspaceTree;
  id: ParentId;
  onSelect(selection: Selection): void;
}) {
  const contents = tree.contents.get(id)!;
  const empty = !contents.folders.length && !contents.notes.length;
  const title = id === null ? 'Workspace' : tree.folders.get(id)!.name;
  return (
    <section className="folder-contents" aria-label="Folder contents">
      <p className="workspace-eyebrow">
        {id === null ? 'A place for your thinking' : 'Folder'}
      </p>
      <h1>{title}</h1>
      {empty ? (
        <div className="workspace-empty">
          <span aria-hidden="true" className="empty-symbol">
            ▱
          </span>
          <h2>
            {id === null ? 'Your workspace is ready.' : 'This folder is empty.'}
          </h2>
          <p>
            {id === null
              ? 'Your saved notes and folders will appear here.'
              : 'Choose another folder or return to the workspace.'}
          </p>
        </div>
      ) : (
        <>
          <p className="workspace-summary">
            {contents.folders.length} folders · {contents.notes.length} notes
          </p>
          <ul className="contents-list">
            {contents.folders.map((folder) => (
              <li key={folder.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'folder', id: folder.id })}
                  aria-label={`Open folder ${folder.name}`}
                >
                  <span className="contents-symbol" aria-hidden="true">
                    ▱
                  </span>
                  <span>{folder.name}</span>
                  <span className="contents-kind">Folder</span>
                </button>
              </li>
            ))}
            {contents.notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'note', id: note.id })}
                  aria-label={`Open note ${note.title}`}
                >
                  <span className="contents-symbol" aria-hidden="true">
                    ≡
                  </span>
                  <span>{note.title}</span>
                  <span className="contents-kind">Note</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
