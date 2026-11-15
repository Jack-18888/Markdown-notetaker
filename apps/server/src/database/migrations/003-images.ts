import type { Migration } from '../migrations.js';

export const imagesMigration: Migration = {
  version: 3,
  name: 'clipboard_images',
  sql: `CREATE TABLE images (
    id TEXT PRIMARY KEY NOT NULL,
    mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
    byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 5242880),
    sha256 TEXT NOT NULL UNIQUE,
    data BLOB NOT NULL CHECK (length(data) = byte_length),
    created_at TEXT NOT NULL
  ) STRICT;`,
};
