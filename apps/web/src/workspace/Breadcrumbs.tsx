import type { Folder, ParentId } from '@markdown-note-taker/contracts';

export default function Breadcrumbs({
  path,
  noteTitle,
  onNavigate,
}: {
  path: Folder[];
  noteTitle?: string;
  onNavigate(id: ParentId): void;
}) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        <li>
          <button
            type="button"
            onClick={() => onNavigate(null)}
            aria-current={
              !path.length && noteTitle === undefined ? 'page' : undefined
            }
          >
            Workspace
          </button>
        </li>
        {path.map((folder, index) => (
          <li key={folder.id}>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() => onNavigate(folder.id)}
              aria-current={
                index === path.length - 1 && noteTitle === undefined
                  ? 'page'
                  : undefined
              }
            >
              {folder.name}
            </button>
          </li>
        ))}
        {noteTitle !== undefined && (
          <li>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{noteTitle}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
