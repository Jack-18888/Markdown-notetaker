import type { ZodType } from 'zod';
import {
  ApiErrorCode,
  MarkdownValidationReason,
  parseContract,
} from '@markdown-note-taker/contracts';
import { WorkspaceError } from './errors.js';

/** Classify workspace validation failures without exposing request values. */
export function validate<Output, Input>(
  schema: ZodType<Output, Input>,
  input: unknown,
): Output {
  return parseContract(schema, input, (issues) => {
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
