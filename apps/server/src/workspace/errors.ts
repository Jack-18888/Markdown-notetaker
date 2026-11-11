import {
  ApiErrorCode,
  apiErrorSchema,
  errorDefinitions,
  type ApiError,
} from '@markdown-note-taker/contracts';

type RevisionConflictDetails = Omit<
  Extract<ApiError, { code: ApiErrorCode.REVISION_CONFLICT }>,
  'code' | 'message'
>;

/** Safe operation failure, ready for the API adapter's error envelope. */
export class WorkspaceError extends Error {
  readonly error: ApiError;
  readonly code: ApiErrorCode;

  constructor(code: Exclude<ApiErrorCode, ApiErrorCode.REVISION_CONFLICT>);
  constructor(
    code: ApiErrorCode.REVISION_CONFLICT,
    details: RevisionConflictDetails,
  );
  constructor(code: ApiErrorCode, details?: RevisionConflictDetails) {
    const error = apiErrorSchema.parse({
      ...details,
      code,
      message: errorDefinitions[code].message,
    });
    super(error.message);
    this.name = 'WorkspaceError';
    this.error = error;
    this.code = error.code;
  }
}

/** Keep SQLite errors and saved content out of caller-visible diagnostics. */
export function guarded<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
  }
}
