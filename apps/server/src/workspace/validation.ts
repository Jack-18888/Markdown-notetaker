import type { ZodError, ZodType } from 'zod';
import { ApiErrorCode } from '@markdown-note-taker/contracts';
import { WorkspaceError } from './errors.js';

type ValidationFailureHandler = (issues: ZodError['issues']) => never;

/** Parse typed input using the caller's failure policy. */
export function validate<Output, Input>(
  schema: ZodType<Output, Input>,
  input: NoInfer<Input>,
  onFailure: ValidationFailureHandler = () => {
    throw new WorkspaceError(ApiErrorCode.INVALID_INPUT);
  },
): Output {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  return onFailure(result.error.issues);
}
