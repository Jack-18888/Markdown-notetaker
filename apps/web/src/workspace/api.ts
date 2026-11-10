import {
  apiContracts,
  errorDefinitions,
  errorResponseSchema,
  parseContract,
  resourceIdSchema,
  type ApiErrorCode,
  type ResourceId,
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
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { signal, cache: 'no-store' });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new WorkspaceRequestError(
      'NETWORK_ERROR',
      'Could not reach your local workspace. Try again.',
    );
  }
  let body: unknown;
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
  if (response.status !== 200) return invalidResponse();
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
