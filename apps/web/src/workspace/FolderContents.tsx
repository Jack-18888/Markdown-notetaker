import type { ParentId } from '@markdown-note-taker/contracts';
import type { Selection, WorkspaceTree } from './tree.js';
import Icon from '../Icon.js';

export default function FolderContents({
  tree,
  id,
  onSelect,
  onCreate,
}: {
  tree: WorkspaceTree;
  id: ParentId;
  onSelect(selection: Selection): void;
  onCreate(): void;
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
            <Icon name="folder" />
          </span>
          <h2>
            {id === null ? 'Your workspace is ready.' : 'This folder is empty.'}
          </h2>
          <p>
            {id === null
              ? 'Create a note or import Markdown to start your workspace.'
              : 'Create a note or import Markdown to start writing here.'}
          </p>
          <button
            type="button"
            className="dialog-primary"
            aria-label={`New note in ${title}`}
            onClick={onCreate}
          >
            New note
          </button>
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
                    <Icon name="folder" />
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
                    <Icon name="note" />
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
