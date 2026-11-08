import { z } from 'zod';
import type { Migration } from '../migrations.js';

// Frozen reader for the original persisted paragraph/text format.
const legacyDocumentSchema = z.strictObject({
  type: z.literal('doc'),
  content: z
    .array(
      z.strictObject({
        type: z.literal('paragraph'),
        content: z
          .array(
            z.strictObject({
              type: z.literal('text'),
              text: z.string().min(1),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
});

function toMarkdown(version: number, json: string): string {
  try {
    if (version !== 1) throw new Error();
    const document = legacyDocumentSchema.parse(JSON.parse(json));
    const content = document.content
      .map((paragraph) =>
        (paragraph.content ?? []).map((text) => text.text).join(''),
      )
      .join('\n\n');
    for (const character of content) {
      const point = character.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) throw new Error();
    }
    if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) throw new Error();
    return content;
  } catch {
    throw new Error('The stored document cannot be migrated without loss.');
  }
}

export const markdownMigration: Migration = {
  version: 2,
  name: 'raw_markdown_content',
  registerFunctions(database) {
    database.function(
      'paragraph_v1_to_markdown_v1',
      { deterministic: true },
      toMarkdown,
    );
  },
  sql: `
    CREATE TABLE notes_markdown (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    INSERT INTO notes_markdown (id, title, folder_id, content, revision, created_at, updated_at)
      SELECT id, title, folder_id,
        paragraph_v1_to_markdown_v1(document_schema_version, document_json),
        revision, created_at, updated_at
      FROM notes;

    DROP TABLE notes;
    ALTER TABLE notes_markdown RENAME TO notes;
    CREATE INDEX notes_folder_id_idx ON notes(folder_id);
  `,
};
