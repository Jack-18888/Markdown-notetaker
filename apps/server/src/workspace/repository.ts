import type Database from 'better-sqlite3';
import type {
  Folder,
  NoteMetadata,
  NoteDetail,
  ResourceId,
  Revision,
} from '@markdown-note-taker/contracts';

type FolderAncestor = Pick<Folder, 'id' | 'parentId'>;

const folderColumns =
  'id, name, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt';
const noteColumns =
  'id, title, folder_id AS folderId, revision, created_at AS createdAt, updated_at AS updatedAt';

/** SQL access only; callers own transactions and domain validation. */
export function createWorkspaceRepository(database: Database.Database) {
  const folders = database.prepare<[], Folder>(
    `SELECT ${folderColumns} FROM folders ORDER BY id`,
  );
  const notes = database.prepare<[], NoteMetadata>(
    `SELECT ${noteColumns} FROM notes ORDER BY id`,
  );
  const folder = database.prepare<[ResourceId], Folder>(
    `SELECT ${folderColumns} FROM folders WHERE id = ?`,
  );
  const note = database.prepare<[ResourceId], NoteDetail>(
    `SELECT ${noteColumns}, content FROM notes WHERE id = ?`,
  );
  const noteMetadata = database.prepare<[ResourceId], NoteMetadata>(
    `SELECT ${noteColumns} FROM notes WHERE id = ?`,
  );
  const ancestors = database.prepare<[ResourceId], FolderAncestor>(`
    WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM folders WHERE id = ?
      UNION
      SELECT folders.id, folders.parent_id FROM folders JOIN ancestors ON folders.id = ancestors.parent_id
    ) SELECT id, parent_id AS parentId FROM ancestors
  `);
  const insertFolder = database.prepare(
    'INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const updateFolder = database.prepare(
    'UPDATE folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?',
  );
  const deleteFolder = database.prepare('DELETE FROM folders WHERE id = ?');
  const insertNote = database.prepare(
    'INSERT INTO notes (id, title, folder_id, content, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const updateNote = database.prepare(
    'UPDATE notes SET title = ?, folder_id = ?, content = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?',
  );
  const deleteNote = database.prepare(
    'DELETE FROM notes WHERE id = ? AND revision = ?',
  );

  return {
    listFolders: () => folders.all(),
    listNotes: () => notes.all(),
    findFolder: (id: ResourceId) => folder.get(id),
    findNote: (id: ResourceId) => note.get(id),
    findNoteMetadata: (id: ResourceId) => noteMetadata.get(id),
    // UNION terminates even if an externally edited database contains a cycle.
    ancestors: (id: ResourceId) => ancestors.all(id),
    insertFolder: (value: Folder) =>
      insertFolder.run(
        value.id,
        value.name,
        value.parentId,
        value.createdAt,
        value.updatedAt,
      ),
    updateFolder: (value: Folder) =>
      updateFolder.run(value.name, value.parentId, value.updatedAt, value.id),
    deleteFolder: (id: ResourceId) => deleteFolder.run(id),
    insertNote: (value: NoteDetail) =>
      insertNote.run(
        value.id,
        value.title,
        value.folderId,
        value.content,
        value.revision,
        value.createdAt,
        value.updatedAt,
      ),
    updateNote: (value: NoteDetail, expectedRevision: Revision) =>
      updateNote.run(
        value.title,
        value.folderId,
        value.content,
        value.updatedAt,
        value.id,
        expectedRevision,
      ),
    deleteNote: (id: ResourceId, expectedRevision: Revision) =>
      deleteNote.run(id, expectedRevision),
  };
}
