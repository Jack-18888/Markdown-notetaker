import type { Migration } from '../migrations.js';

export const initialWorkspaceMigration: Migration = {
  version: 1,
  name: 'initial_workspace',
  sql: `
    CREATE TABLE folders (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (parent_id IS NULL OR parent_id <> id)
    ) STRICT;

    CREATE TABLE notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      document_json TEXT NOT NULL CHECK (json_valid(document_json) AND json_type(document_json) = 'object'),
      document_schema_version INTEGER NOT NULL CHECK (document_schema_version > 0),
      revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX folders_parent_id_idx ON folders(parent_id);
    CREATE INDEX notes_folder_id_idx ON notes(folder_id);
  `,
};
