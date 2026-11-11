import type { ZodType } from 'zod';
import {
  ApiErrorCode,
  MarkdownValidationReason,
  type CreateNoteRequest,
  type UpdateNoteRequest,
} from '@markdown-note-taker/contracts';
import { WorkspaceError } from './errors.js';
import { validate } from './validation.js';

/** Note writes report the Markdown byte cap separately from invalid input. */
export function validateNoteRequest<
  Request extends CreateNoteRequest | UpdateNoteRequest,
>(schema: ZodType<Request>, input: NoInfer<Request>): Request {
  return validate(schema, input, (issues) => {
    if (
      issues.some(
        (issue) =>
          issue.path[0] === 'content' &&
          issue.code === 'custom' &&
          issue.params?.markdownReason === MarkdownValidationReason.BYTE_LIMIT,
      )
    )
      throw new WorkspaceError(ApiErrorCode.PAYLOAD_TOO_LARGE);
    throw new WorkspaceError(ApiErrorCode.INVALID_INPUT);
  });
}
