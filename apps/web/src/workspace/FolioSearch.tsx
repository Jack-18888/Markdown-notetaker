import { useState } from 'react';
import type { NoteMetadata } from '@markdown-note-taker/contracts';
import type { WorkspaceTree } from './tree.js';
import Modal from './Modal.js';

export default function FolioSearch({
  tree,
  onSelect,
  onClose,
}: {
  tree: WorkspaceTree;
  onSelect(note: NoteMetadata): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const results = [...tree.notes.values()]
    .filter(({ title }) => title.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 50);

  return (
    <Modal title="Quick search" pending={false} onDismiss={onClose}>
      <form
        className="folio-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) onSelect(results[0]);
        }}
      >
        <label>
          Search by note title
          <input
            type="search"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        {results.length ? (
          <ul aria-label="Matching notes">
            {results.map((note) => (
              <li key={note.id}>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => onSelect(note)}
                >
                  <strong>{note.title}</strong>
                  <span>
                    {tree
                      .breadcrumbs(note.folderId)
                      .map(({ name }) => name)
                      .join(' / ') || 'Workspace'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">No matching notes.</p>
        )}
        <div className="dialog-actions">
          <button className="quiet-button" type="button" onClick={onClose}>
            Close search
          </button>
        </div>
      </form>
    </Modal>
  );
}
