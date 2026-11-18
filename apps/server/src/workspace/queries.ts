import {
  folderSchema,
  noteMetadataSchema,
  parentIdSchema,
  resourceIdSchema,
} from '@markdown-note-taker/contracts';
import { z } from 'zod';

export const defaultPageSize = 50;
const limitSchema = z.number().int().min(1).max(100).optional();
const folderCursorSchema = z.strictObject({
  kind: z.enum(['folder', 'note']),
  id: resourceIdSchema,
});

export const listFolderSchema = z.strictObject({
  folderId: parentIdSchema,
  cursor: folderCursorSchema.optional(),
  limit: limitSchema,
});

export const searchNotesSchema = z.strictObject({
  query: z
    .string()
    .max(200)
    .refine(
      (value) =>
        value.trim().length > 0 &&
        !/[\uD800-\uDFFF]/u.test(value) &&
        !value.includes('\0'),
      'Supply non-empty literal search text.',
    ),
  folderId: parentIdSchema.optional(),
  cursor: resourceIdSchema.optional(),
  limit: limitSchema,
});

const folderItemSchema = z.discriminatedUnion('kind', [
  folderSchema.extend({ kind: z.literal('folder') }),
  noteMetadataSchema.extend({ kind: z.literal('note') }),
]);

export const folderPageSchema = z.strictObject({
  items: z.array(folderItemSchema),
  nextCursor: folderCursorSchema.nullable(),
});

export const noteSearchPageSchema = z.strictObject({
  notes: z.array(noteMetadataSchema),
  nextCursor: resourceIdSchema.nullable(),
});

export type ListFolderRequest = z.infer<typeof listFolderSchema>;
export type SearchNotesRequest = z.infer<typeof searchNotesSchema>;
export type FolderPage = z.infer<typeof folderPageSchema>;
export type NoteSearchPage = z.infer<typeof noteSearchPageSchema>;
