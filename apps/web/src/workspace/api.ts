import {
  apiContracts,
  errorDefinitions,
  errorResponseSchema,
  parseContract,
  resourceIdSchema,
  ApiErrorCode,
  updateNoteRequestSchema,
  createFolderRequestSchema,
  createNoteRequestSchema,
  updateFolderRequestSchema,
  deleteNoteRequestSchema,
  type ParentId,
  type UpdateFolderRequest,
  type UpdateNoteRequest,
  type ResourceId,
  type Revision,
} from '@markdown-note-taker/contracts';

export class WorkspaceRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message);
  }
}

function invalidResponse(): never {
  throw new WorkspaceRequestError(
    'INVALID_RESPONSE',
    'The workspace returned an unreadable response. Try again.',
  );
}

async function requestJson(
  path: string,
  signal: AbortSignal,
  options: RequestInit = {},
  status = 200,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { ...options, signal, cache: 'no-store' });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new WorkspaceRequestError(
      'NETWORK_ERROR',
      'Could not reach your local workspace. Try again.',
    );
  }
  let body: unknown;
  if (response.status === status && status === 204) {
    if (await response.text()) return invalidResponse();
    return undefined;
  }
  try {
    body = await response.json();
  } catch {
    return invalidResponse();
  }
  if (!response.ok) {
    const result = errorResponseSchema.safeParse(body);
    if (
      !result.success ||
      errorDefinitions[result.data.error.code].status !== response.status
    )
      return invalidResponse();
    throw new WorkspaceRequestError(
      result.data.error.code,
      result.data.error.message,
    );
  }
  if (response.status !== status) return invalidResponse();
  return body;
}

export async function getTree(signal: AbortSignal) {
  return parseContract(
    apiContracts.tree.response,
    await requestJson(apiContracts.tree.path, signal),
    invalidResponse,
  );
}

export async function getNote(id: ResourceId, signal: AbortSignal) {
  parseContract(resourceIdSchema, id, invalidResponse);
  const path = apiContracts.getNote.path.replace(':id', encodeURIComponent(id));
  const note = parseContract(
    apiContracts.getNote.response,
    await requestJson(path, signal),
    invalidResponse,
  );
  if (note.id !== id) return invalidResponse();
  return note;
}

function invalidInput(): never {
  throw new WorkspaceRequestError(
    ApiErrorCode.INVALID_INPUT,
    errorDefinitions.INVALID_INPUT.message,
  );
}

export async function updateNote(
  id: ResourceId,
  input: UpdateNoteRequest,
  signal: AbortSignal,
) {
  parseContract(resourceIdSchema, id, invalidInput);
  const body = parseContract(updateNoteRequestSchema, input, invalidInput);
  const path = apiContracts.updateNote.path.replace(
    ':id',
    encodeURIComponent(id),
  );
  const note = parseContract(
    apiContracts.updateNote.response,
    await requestJson(path, signal, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    invalidResponse,
  );
  if (note.id !== id) return invalidResponse();
  return note;
}

export async function createFolder(
  name: string,
  parentId: ParentId,
  signal: AbortSignal,
) {
  const body = parseContract(
    createFolderRequestSchema,
    { name, parentId },
    invalidInput,
  );
  return parseContract(
    apiContracts.createFolder.response,
    await requestJson(
      apiContracts.createFolder.path,
      signal,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      apiContracts.createFolder.status,
    ),
    invalidResponse,
  );
}

export async function createNote(
  title: string,
  folderId: ParentId,
  signal: AbortSignal,
  content?: string,
) {
  const body = parseContract(
    createNoteRequestSchema,
    { title, folderId, ...(content === undefined ? {} : { content }) },
    invalidInput,
  );
  return parseContract(
    apiContracts.createNote.response,
    await requestJson(
      apiContracts.createNote.path,
      signal,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      apiContracts.createNote.status,
    ),
    invalidResponse,
  );
}

export async function updateFolder(
  id: ResourceId,
  input: UpdateFolderRequest,
  signal: AbortSignal,
) {
  parseContract(resourceIdSchema, id, invalidInput);
  const body = parseContract(updateFolderRequestSchema, input, invalidInput);
  const folder = parseContract(
    apiContracts.updateFolder.response,
    await requestJson(
      apiContracts.updateFolder.path.replace(':id', encodeURIComponent(id)),
      signal,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
    invalidResponse,
  );
  if (folder.id !== id) return invalidResponse();
  return folder;
}

export async function deleteFolder(
  id: ResourceId,
  signal: AbortSignal,
): Promise<void> {
  parseContract(resourceIdSchema, id, invalidInput);
  await requestJson(
    apiContracts.deleteFolder.path.replace(':id', encodeURIComponent(id)),
    signal,
    { method: 'DELETE' },
    apiContracts.deleteFolder.status,
  );
}

export async function deleteNote(
  id: ResourceId,
  expectedRevision: Revision,
  signal: AbortSignal,
): Promise<void> {
  parseContract(resourceIdSchema, id, invalidInput);
  const body = parseContract(
    deleteNoteRequestSchema,
    { expectedRevision },
    invalidInput,
  );
  await requestJson(
    apiContracts.deleteNote.path.replace(':id', encodeURIComponent(id)),
    signal,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    apiContracts.deleteNote.status,
  );
}
