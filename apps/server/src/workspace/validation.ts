import type { ZodType } from 'zod';
import {
  ApiErrorCode,
  parseContract,
  type ValidationFailureHandler,
} from '@markdown-note-taker/contracts';
import { WorkspaceError } from './errors.js';

/** Apply the workspace's default failure policy to shared contract parsing. */
export function validate<Output, Input>(
  schema: ZodType<Output, Input>,
  input: unknown,
  onFailure: ValidationFailureHandler = () => {
    throw new WorkspaceError(ApiErrorCode.INVALID_INPUT);
  },
): Output {
  return parseContract(schema, input, onFailure);
}
