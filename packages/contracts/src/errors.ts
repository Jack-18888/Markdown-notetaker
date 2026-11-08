import { z } from 'zod';
import {
  expectedRevisionSchema,
  resourceIdSchema,
  revisionSchema,
} from './primitives.ts';

/** Public codes, statuses, and fixed messages; never include note contents. */
export const errorDefinitions = {
  INVALID_INPUT: { status: 400, message: 'The request is invalid.' },
  INVALID_DOCUMENT: { status: 400, message: 'The document is invalid.' },
  UNSUPPORTED_DOCUMENT_VERSION: {
    status: 400,
    message: 'This document schema version is not supported.',
  },
  NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
  HIERARCHY_CONFLICT: {
    status: 409,
    message:
      'The destination must be an existing folder outside the moved subtree.',
  },
  REVISION_CONFLICT: {
    status: 409,
    message: 'The note changed since it was loaded.',
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: 'The request or document exceeds its size limit.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: 'A JSON request body is required.',
  },
  ORIGIN_FORBIDDEN: {
    status: 403,
    message: 'This browser origin is not allowed.',
  },
  INVALID_HOST: { status: 403, message: 'This host is not allowed.' },
  INTERNAL_ERROR: {
    status: 500,
    message: 'The operation could not be completed.',
  },
} as const;

export type ApiErrorCode = keyof typeof errorDefinitions;

function errorShape<Code extends ApiErrorCode>(code: Code) {
  return {
    code: z.literal(code),
    message: z.literal(errorDefinitions[code].message),
  };
}

/** Error variants; conflicts include IDs and revision counters only. */
export const apiErrorSchema = z.discriminatedUnion('code', [
  z.strictObject(errorShape('INVALID_INPUT')),
  z.strictObject(errorShape('INVALID_DOCUMENT')),
  z.strictObject(errorShape('UNSUPPORTED_DOCUMENT_VERSION')),
  z.strictObject(errorShape('NOT_FOUND')),
  z.strictObject(errorShape('HIERARCHY_CONFLICT')),
  z
    .strictObject({
      ...errorShape('REVISION_CONFLICT'),
      noteId: resourceIdSchema,
      expectedRevision: expectedRevisionSchema,
      currentRevision: revisionSchema,
    })
    .refine(
      (error) => error.expectedRevision !== error.currentRevision,
      'Conflicting revisions must differ.',
    ),
  z.strictObject(errorShape('PAYLOAD_TOO_LARGE')),
  z.strictObject(errorShape('UNSUPPORTED_MEDIA_TYPE')),
  z.strictObject(errorShape('ORIGIN_FORBIDDEN')),
  z.strictObject(errorShape('INVALID_HOST')),
  z.strictObject(errorShape('INTERNAL_ERROR')),
]);

export const errorResponseSchema = z.strictObject({ error: apiErrorSchema });
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
