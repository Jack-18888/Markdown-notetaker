import { z } from 'zod';
import { documentEnvelopeSchema } from './document.ts';
import {
  expectedRevisionSchema,
  nameSchema,
  noParamsSchema,
  parentIdSchema,
  resourceIdSchema,
  resourceParamsSchema,
  revisionSchema,
  timestampSchema,
} from './primitives.ts';

export const applicationName = 'Markdown Note Taker';
export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
  application: z.literal(applicationName),
});

/** Folder metadata and location. */
export const folderSchema = z.strictObject({
  id: resourceIdSchema,
  name: nameSchema,
  parentId: parentIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** Navigation metadata without the note body. */
export const noteMetadataSchema = z.strictObject({
  id: resourceIdSchema,
  title: nameSchema,
  folderId: parentIdSchema,
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
/** Full note, including its document. */
export const noteDetailSchema = noteMetadataSchema.extend({
  document: documentEnvelopeSchema,
});
/** Flat metadata lists linked by parent IDs. */
export const treeResponseSchema = z.strictObject({
  folders: z.array(folderSchema),
  notes: z.array(noteMetadataSchema),
});

/** Create a folder; null parentId means root. */
export const createFolderRequestSchema = z.strictObject({
  name: nameSchema,
  parentId: parentIdSchema,
});
/** Rename or move; omitted fields stay unchanged. */
export const updateFolderRequestSchema = z
  .strictObject({
    name: nameSchema.optional(),
    parentId: parentIdSchema.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.parentId !== undefined,
    'Supply a name or destination.',
  );

/** Omitted document creates a blank note; invalid documents are rejected. */
export const createNoteRequestSchema = z.strictObject({
  title: nameSchema,
  folderId: parentIdSchema,
  document: documentEnvelopeSchema.optional(),
});
/** Rename, move, or edit against the client's loaded revision. */
export const updateNoteRequestSchema = z
  .strictObject({
    expectedRevision: expectedRevisionSchema,
    title: nameSchema.optional(),
    folderId: parentIdSchema.optional(),
    document: documentEnvelopeSchema.optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.folderId !== undefined ||
      body.document !== undefined,
    'Supply a title, destination, or document.',
  );
/** Revision check protects against stale delete confirmations. */
export const deleteNoteRequestSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
});

/** Route shapes and success statuses; null body/response means no HTTP body. */
export const apiContracts = {
  health: {
    method: 'GET',
    path: '/api/health',
    params: noParamsSchema,
    body: null,
    status: 200,
    response: healthResponseSchema,
  },
  tree: {
    method: 'GET',
    path: '/api/tree',
    params: noParamsSchema,
    body: null,
    status: 200,
    response: treeResponseSchema,
  },
  getNote: {
    method: 'GET',
    path: '/api/notes/:id',
    params: resourceParamsSchema,
    body: null,
    status: 200,
    response: noteDetailSchema,
  },
  createFolder: {
    method: 'POST',
    path: '/api/folders',
    params: noParamsSchema,
    body: createFolderRequestSchema,
    status: 201,
    response: folderSchema,
  },
  updateFolder: {
    method: 'PATCH',
    path: '/api/folders/:id',
    params: resourceParamsSchema,
    body: updateFolderRequestSchema,
    status: 200,
    response: folderSchema,
  },
  deleteFolder: {
    method: 'DELETE',
    path: '/api/folders/:id',
    params: resourceParamsSchema,
    body: null,
    status: 204,
    response: null,
  },
  createNote: {
    method: 'POST',
    path: '/api/notes',
    params: noParamsSchema,
    body: createNoteRequestSchema,
    status: 201,
    response: noteDetailSchema,
  },
  updateNote: {
    method: 'PATCH',
    path: '/api/notes/:id',
    params: resourceParamsSchema,
    body: updateNoteRequestSchema,
    status: 200,
    response: noteDetailSchema,
  },
  deleteNote: {
    method: 'DELETE',
    path: '/api/notes/:id',
    params: resourceParamsSchema,
    body: deleteNoteRequestSchema,
    status: 204,
    response: null,
  },
} as const;

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type NoteMetadata = z.infer<typeof noteMetadataSchema>;
export type NoteDetail = z.infer<typeof noteDetailSchema>;
export type TreeResponse = z.infer<typeof treeResponseSchema>;
export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>;
export type UpdateFolderRequest = z.infer<typeof updateFolderRequestSchema>;
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;
export type DeleteNoteRequest = z.infer<typeof deleteNoteRequestSchema>;
