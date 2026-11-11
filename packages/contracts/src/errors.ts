import { z } from 'zod';
import {
  expectedRevisionSchema,
  resourceIdSchema,
  revisionSchema,
} from './primitives.ts';

/** Stable error codes serialized in API responses. */
export enum ApiErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  HIERARCHY_CONFLICT = 'HIERARCHY_CONFLICT',
  REVISION_CONFLICT = 'REVISION_CONFLICT',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',
  ORIGIN_FORBIDDEN = 'ORIGIN_FORBIDDEN',
  INVALID_HOST = 'INVALID_HOST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ApiErrorDefinition {
  status: number;
  message: string;
}

/** Fixed status/message for each public code; never include note contents. */
export const errorDefinitions = {
  [ApiErrorCode.INVALID_INPUT]: {
    status: 400,
    message: 'The request is invalid.',
  },
  [ApiErrorCode.NOT_FOUND]: {
    status: 404,
    message: 'The requested resource was not found.',
  },
  [ApiErrorCode.HIERARCHY_CONFLICT]: {
    status: 409,
    message:
      'The destination must be an existing folder outside the moved subtree.',
  },
  [ApiErrorCode.REVISION_CONFLICT]: {
    status: 409,
    message: 'The note changed since it was loaded.',
  },
  [ApiErrorCode.PAYLOAD_TOO_LARGE]: {
    status: 413,
    message: 'The request or Markdown content exceeds its size limit.',
  },
  [ApiErrorCode.UNSUPPORTED_MEDIA_TYPE]: {
    status: 415,
    message: 'A JSON request body is required.',
  },
  [ApiErrorCode.ORIGIN_FORBIDDEN]: {
    status: 403,
    message: 'This browser origin is not allowed.',
  },
  [ApiErrorCode.INVALID_HOST]: {
    status: 403,
    message: 'This host is not allowed.',
  },
  [ApiErrorCode.INTERNAL_ERROR]: {
    status: 500,
    message: 'The operation could not be completed.',
  },
} as const satisfies Record<ApiErrorCode, ApiErrorDefinition>;

function errorShape<Code extends ApiErrorCode>(code: Code) {
  return {
    code: z.literal(code),
    message: z.literal(errorDefinitions[code].message),
  };
}

/** Error variants; conflicts include IDs and revision counters only. */
export const apiErrorSchema = z.discriminatedUnion('code', [
  z.strictObject(errorShape(ApiErrorCode.INVALID_INPUT)),
  z.strictObject(errorShape(ApiErrorCode.NOT_FOUND)),
  z.strictObject(errorShape(ApiErrorCode.HIERARCHY_CONFLICT)),
  z
    .strictObject({
      ...errorShape(ApiErrorCode.REVISION_CONFLICT),
      noteId: resourceIdSchema,
      expectedRevision: expectedRevisionSchema,
      currentRevision: revisionSchema,
    })
    .refine(
      (error) => error.expectedRevision !== error.currentRevision,
      'Conflicting revisions must differ.',
    ),
  z.strictObject(errorShape(ApiErrorCode.PAYLOAD_TOO_LARGE)),
  z.strictObject(errorShape(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE)),
  z.strictObject(errorShape(ApiErrorCode.ORIGIN_FORBIDDEN)),
  z.strictObject(errorShape(ApiErrorCode.INVALID_HOST)),
  z.strictObject(errorShape(ApiErrorCode.INTERNAL_ERROR)),
]);

export const errorResponseSchema = z.strictObject({ error: apiErrorSchema });
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
