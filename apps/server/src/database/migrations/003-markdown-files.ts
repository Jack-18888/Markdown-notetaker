import type { Migration } from '../migrations.js';
import { noteFiles } from '../note-files.js';

export const markdownFilesMigration: Migration = {
  version: 3,
  name: 'markdown_files',
  registerFunctions(database, dataDirectory) {
    const files = noteFiles(dataDirectory);
    database.function('stage_markdown_file_v1', (id: string, content: Buffer) =>
      files.stage(id, content),
    );
  },
  sql: `
    CREATE TABLE notes_files (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      content_path TEXT NOT NULL UNIQUE,
      revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    INSERT INTO notes_files (id, title, folder_id, content_path, revision, created_at, updated_at)
      SELECT id, title, folder_id, stage_markdown_file_v1(id, CAST(content AS BLOB)),
        revision, created_at, updated_at
      FROM notes;

    DROP TABLE notes;
    ALTER TABLE notes_files RENAME TO notes;
    CREATE INDEX notes_folder_id_idx ON notes(folder_id);

    CREATE TABLE note_file_cleanup (
      path TEXT PRIMARY KEY NOT NULL
    ) STRICT;

    CREATE TRIGGER queue_replaced_note_file AFTER UPDATE OF content_path ON notes
      WHEN OLD.content_path <> NEW.content_path
      BEGIN
        INSERT OR IGNORE INTO note_file_cleanup (path) VALUES (OLD.content_path);
      END;

    CREATE TRIGGER queue_deleted_note_file AFTER DELETE ON notes
      BEGIN
        INSERT OR IGNORE INTO note_file_cleanup (path) VALUES (OLD.content_path);
      END;
  `,
};
