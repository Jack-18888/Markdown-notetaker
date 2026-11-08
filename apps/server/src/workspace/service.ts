import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  ApiErrorCode,
  createFolderRequestSchema,
  createNoteRequestSchema,
  deleteNoteRequestSchema,
  resourceIdSchema,
  updateFolderRequestSchema,
  updateNoteRequestSchema,
  type CreateFolderRequest,
  type CreateNoteRequest,
  type DeleteNoteRequest,
  type Folder,
  type NoteDetail,
  type ParentId,
  type ResourceId,
  type TreeResponse,
  type UpdateFolderRequest,
  type UpdateNoteRequest,
} from '@markdown-note-taker/contracts';
import { guarded, WorkspaceError } from './errors.js';
import { validateNoteRequest } from './note-validation.js';
import { createWorkspaceRepository } from './repository.js';
import type { WorkspaceService } from './types.js';
import { validate } from './validation.js';

/** Transactional folder/note operations over an initialized workspace database. */
export function createWorkspaceService(
  database: Database.Database,
): WorkspaceService {
  const repository = guarded(() => createWorkspaceRepository(database));

  const write = <T>(operation: () => T): T =>
    guarded(() => database.transaction(operation).immediate());

  // find the target folder in folders, throws an error if DNE
  function requireFolder(id: ResourceId): Folder {
    const folder = repository.findFolder(id);
    if (!folder) throw new WorkspaceError(ApiErrorCode.NOT_FOUND);
    return folder;
  }

  // find the target note in notes, throws an error if DNE
  function requireNote(id: ResourceId): NoteDetail {
    const note = repository.findNote(id);
    if (!note) throw new WorkspaceError(ApiErrorCode.NOT_FOUND);
    return note;
  }

  /** Require a path to root that excludes the folder being moved. */
  function validateFolderDestination(
    parentId: ParentId,
    movingFolderId?: ResourceId,
  ): void {
    if (parentId === null) return;
    if (!repository.findFolder(parentId))
      throw new WorkspaceError(ApiErrorCode.HIERARCHY_CONFLICT);
    const ancestors = repository.ancestors(parentId);
    const containsMovedFolder = ancestors.some(
      (folder) => folder.id === movingFolderId,
    );
    const reachesRoot = ancestors.some((folder) => folder.parentId === null);
    if (containsMovedFolder || !reachesRoot)
      throw new WorkspaceError(ApiErrorCode.HIERARCHY_CONFLICT);
  }

  return {
    /** Consistent metadata snapshot, also usable for subtree-delete confirmation. */
    listTree(): TreeResponse {
      return guarded(() =>
        database.transaction(() => ({
          folders: repository.listFolders(),
          notes: repository.listNotes(),
        }))(),
      );
    },

    getNote(id: ResourceId): NoteDetail {
      const noteId = validate(resourceIdSchema, id);
      return guarded(() => requireNote(noteId));
    },

    createFolder(input: CreateFolderRequest): Folder {
      const body = validate(createFolderRequestSchema, input);
      return write(() => {
        validateFolderDestination(body.parentId);
        const timestamp = new Date().toISOString();
        const folder = {
          id: randomUUID(),
          ...body,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        repository.insertFolder(folder);
        return requireFolder(folder.id);
      });
    },

    updateFolder(id: ResourceId, input: UpdateFolderRequest): Folder {
      const folderId = validate(resourceIdSchema, id);
      const body = validate(updateFolderRequestSchema, input);
      return write(() => {
        const current = requireFolder(folderId);
        const parentId =
          body.parentId === undefined ? current.parentId : body.parentId;
        validateFolderDestination(parentId, folderId);
        if (
          repository.updateFolder({
            ...current,
            name: body.name ?? current.name,
            parentId,
            updatedAt: new Date().toISOString(),
          }).changes !== 1
        )
          throw new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
        return requireFolder(folderId);
      });
    },

    deleteFolder(id: ResourceId): void {
      const folderId = validate(resourceIdSchema, id);
      return write(() => {
        const folder = requireFolder(folderId);
        validateFolderDestination(folder.parentId, folderId);
        // Foreign-key cascades delete the complete subtree in this transaction.
        if (repository.deleteFolder(folderId).changes !== 1)
          throw new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
      });
    },

    createNote(input: CreateNoteRequest): NoteDetail {
      const body = validateNoteRequest(createNoteRequestSchema, input);
      return write(() => {
        validateFolderDestination(body.folderId);
        const timestamp = new Date().toISOString();
        const note: NoteDetail = {
          id: randomUUID(),
          title: body.title,
          folderId: body.folderId,
          content: body.content ?? '',
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        repository.insertNote(note);
        return requireNote(note.id);
      });
    },

    updateNote(id: ResourceId, input: UpdateNoteRequest): NoteDetail {
      const noteId = validate(resourceIdSchema, id);
      const body = validateNoteRequest(updateNoteRequestSchema, input);
      return write(() => {
        const current = requireNote(noteId);
        if (current.revision !== body.expectedRevision)
          throw new WorkspaceError(ApiErrorCode.REVISION_CONFLICT, {
            noteId,
            expectedRevision: body.expectedRevision,
            currentRevision: current.revision,
          });
        const folderId =
          body.folderId === undefined ? current.folderId : body.folderId;
        validateFolderDestination(folderId);
        const next: NoteDetail = {
          ...current,
          title: body.title ?? current.title,
          folderId,
          content: body.content ?? current.content,
          updatedAt: new Date().toISOString(),
        };
        if (repository.updateNote(next, body.expectedRevision).changes !== 1)
          throw new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
        return requireNote(noteId);
      });
    },

    deleteNote(id: ResourceId, input: DeleteNoteRequest): void {
      const noteId = validate(resourceIdSchema, id);
      const body = validate(deleteNoteRequestSchema, input);
      return write(() => {
        const current = repository.findNoteMetadata(noteId);
        if (!current) throw new WorkspaceError(ApiErrorCode.NOT_FOUND);
        if (current.revision !== body.expectedRevision)
          throw new WorkspaceError(ApiErrorCode.REVISION_CONFLICT, {
            noteId,
            expectedRevision: body.expectedRevision,
            currentRevision: current.revision,
          });
        if (repository.deleteNote(noteId, body.expectedRevision).changes !== 1)
          throw new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
      });
    },
  };
}
