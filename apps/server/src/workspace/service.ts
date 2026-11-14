import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
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
  type NoteMetadata,
  type ParentId,
  type ResourceId,
  type Revision,
  type TreeResponse,
  type UpdateFolderRequest,
  type UpdateNoteRequest,
} from '@markdown-note-taker/contracts';
import { guarded, WorkspaceError } from './errors.js';
import { noteFiles } from '../database/note-files.js';
import { createWorkspaceRepository, type StoredNote } from './repository.js';
import type { WorkspaceService } from './types.js';
import { validate } from './validation.js';

/** Transactional folder/note operations over an initialized workspace database. */
export function createWorkspaceService(
  database: Database.Database,
): WorkspaceService {
  const repository = guarded(() => createWorkspaceRepository(database));
  const files = noteFiles(dirname(database.name));

  const write = <T>(operation: () => T): T =>
    guarded(() => database.transaction(operation).immediate());

  function finishFiles(staged: string[] = [], startup = false) {
    try {
      database
        .transaction(() => {
          const pending = startup ? files.pending() : staged;
          for (const path of new Set([
            ...pending,
            ...repository.queuedFiles(),
          ])) {
            files.finish(path, repository.referencesFile(path));
            repository.dequeueFile(path);
          }
        })
        .immediate();
    } catch {
      // Committed metadata is authoritative. Retry cleanup on next startup.
    }
  }

  finishFiles([], true);

  function writeWithFiles<T>(operation: (staged: string[]) => T): T {
    const staged: string[] = [];
    try {
      return write(() => operation(staged));
    } finally {
      finishFiles(staged);
    }
  }

  function readNote({ contentPath, ...metadata }: StoredNote): NoteDetail {
    return { ...metadata, content: files.read(contentPath) };
  }

  // find the target folder in folders, throws an error if DNE
  function requireFolder(id: ResourceId): Folder {
    const folder = repository.findFolder(id);
    if (!folder) throw new WorkspaceError(ApiErrorCode.NOT_FOUND);
    return folder;
  }

  // find the target note in notes, throws an error if DNE
  function requireNote(id: ResourceId): StoredNote {
    const note = repository.findNote(id);
    if (!note) throw new WorkspaceError(ApiErrorCode.NOT_FOUND);
    return note;
  }

  /** Reject writes based on a stale loaded note revision. */
  function assertExpectedRevision(
    note: Pick<NoteMetadata, 'id' | 'revision'>,
    expectedRevision: Revision,
  ): void {
    if (note.revision !== expectedRevision)
      throw new WorkspaceError(ApiErrorCode.REVISION_CONFLICT, {
        noteId: note.id,
        expectedRevision,
        currentRevision: note.revision,
      });
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
      // Keep the file live until the read finishes, even with another server connection.
      return write(() => readNote(requireNote(noteId)));
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
      return writeWithFiles(() => {
        const folder = requireFolder(folderId);
        validateFolderDestination(folder.parentId, folderId);
        // Foreign-key cascades delete the complete subtree in this transaction.
        if (repository.deleteFolder(folderId).changes !== 1)
          throw new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
      });
    },

    createNote(input: CreateNoteRequest): NoteDetail {
      const body = validate(createNoteRequestSchema, input);
      return writeWithFiles((staged) => {
        validateFolderDestination(body.folderId);
        const timestamp = new Date().toISOString();
        const id = randomUUID();
        const content = body.content ?? '';
        const contentPath = files.stage(id, Buffer.from(content));
        staged.push(contentPath);
        repository.insertNote({
          id,
          title: body.title,
          folderId: body.folderId,
          contentPath,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        return readNote(requireNote(id));
      });
    },

    updateNote(id: ResourceId, input: UpdateNoteRequest): NoteDetail {
      const noteId = validate(resourceIdSchema, id);
      const body = validate(updateNoteRequestSchema, input);
      return writeWithFiles((staged) => {
        const current = requireNote(noteId);
        assertExpectedRevision(current, body.expectedRevision);
        const folderId =
          body.folderId === undefined ? current.folderId : body.folderId;
        validateFolderDestination(folderId);
        const previous = files.read(current.contentPath);
        let contentPath = current.contentPath;
        if (body.content !== undefined && body.content !== previous) {
          contentPath = files.stage(noteId, Buffer.from(body.content));
          staged.push(contentPath);
        }
        const next: StoredNote = {
          ...current,
          title: body.title ?? current.title,
          folderId,
          contentPath,
          updatedAt: new Date().toISOString(),
        };
        if (repository.updateNote(next, body.expectedRevision).changes !== 1)
          throw new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
        return readNote(requireNote(noteId));
      });
    },

    deleteNote(id: ResourceId, input: DeleteNoteRequest): void {
      const noteId = validate(resourceIdSchema, id);
      const body = validate(deleteNoteRequestSchema, input);
      return writeWithFiles(() => {
        const current = requireNote(noteId);
        assertExpectedRevision(current, body.expectedRevision);
        if (repository.deleteNote(noteId, body.expectedRevision).changes !== 1)
          throw new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
      });
    },
  };
}
