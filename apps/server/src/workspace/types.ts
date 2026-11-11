import type {
  CreateFolderRequest,
  CreateNoteRequest,
  DeleteNoteRequest,
  Folder,
  NoteDetail,
  ResourceId,
  TreeResponse,
  UpdateFolderRequest,
  UpdateNoteRequest,
} from '@markdown-note-taker/contracts';

/** Folder/note operations and their committed results. */
export interface WorkspaceService {
  listTree(): TreeResponse;
  getNote(id: ResourceId): NoteDetail;
  createFolder(input: CreateFolderRequest): Folder;
  updateFolder(id: ResourceId, input: UpdateFolderRequest): Folder;
  deleteFolder(id: ResourceId): void;
  createNote(input: CreateNoteRequest): NoteDetail;
  updateNote(id: ResourceId, input: UpdateNoteRequest): NoteDetail;
  deleteNote(id: ResourceId, input: DeleteNoteRequest): void;
}

/** Public workspace handle; the connection remains private. */
export interface Workspace {
  service: WorkspaceService;
  close(): void;
}
