import type { ZodError, ZodType } from 'zod';

export type ValidationFailureHandler = (issues: ZodError['issues']) => never;

/** Parse external input with a caller-owned validation failure policy. */
export function parseContract<Output, Input>(
  schema: ZodType<Output, Input>,
  input: unknown,
  onFailure: ValidationFailureHandler,
): Output {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  return onFailure(result.error.issues);
}
