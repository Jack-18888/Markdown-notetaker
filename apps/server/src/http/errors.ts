import type { ErrorRequestHandler } from 'express';
import {
  ApiErrorCode,
  errorDefinitions,
  errorResponseSchema,
} from '@markdown-note-taker/contracts';
import { WorkspaceError } from '../workspace/errors.js';

/** Translate transport failures without copying parser diagnostics or content. */
function publicError(error: unknown): WorkspaceError {
  if (error instanceof WorkspaceError) return error;
  if (error instanceof URIError)
    return new WorkspaceError(ApiErrorCode.INVALID_INPUT);
  const type =
    error && typeof error === 'object' && 'type' in error
      ? error.type
      : undefined;
  switch (type) {
    case 'entity.too.large':
      return new WorkspaceError(ApiErrorCode.PAYLOAD_TOO_LARGE);
    case 'entity.parse.failed':
    case 'request.aborted':
    case 'request.size.invalid':
      return new WorkspaceError(ApiErrorCode.INVALID_INPUT);
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new WorkspaceError(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
    default:
      return new WorkspaceError(ApiErrorCode.INTERNAL_ERROR);
  }
}

export const apiErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  const failure = publicError(error);
  response
    .status(errorDefinitions[failure.code].status)
    .json(errorResponseSchema.parse({ error: failure.error }));
};
