import { z } from 'zod';
import { limits } from './limits.ts';

/** Stable resource ID, independent of name or location. */
export const resourceIdSchema = z
  .uuidv4()
  .refine(
    (value) => value === value.toLowerCase(),
    'Identifiers must use lowercase UUIDs.',
  );
/** Containing folder ID; null means the workspace root. */
export const parentIdSchema = resourceIdSchema.nullable();

/** Display name/title, preserved verbatim; duplicates are allowed. */
export const nameSchema = z
  .string()
  .min(1)
  // Each code point uses at most two UTF-16 units.
  .max(limits.nameCharacters * 2)
  .refine(
    (value) => [...value].length <= limits.nameCharacters,
    'Name is too long.',
  )
  .refine((value) => value === value.trim(), 'Remove surrounding whitespace.')
  .refine(
    (value) =>
      [...value].every((character) => {
        const point = character.codePointAt(0)!;
        return (
          point > 31 &&
          (point < 127 || point > 159) &&
          (point < 0xd800 || point > 0xdfff)
        );
      }),
    'Use valid Unicode without control characters.',
  );

/** Saved-note edit counter; increments on title, body, or location updates. */
export const revisionSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);
/** Loaded revision for conflict checks; leaves room for the next increment. */
export const expectedRevisionSchema = revisionSchema.max(
  Number.MAX_SAFE_INTEGER - 1,
);
/** Server-generated UTC timestamp with milliseconds. */
export const timestampSchema = z.iso.datetime({ precision: 3 });
/** Named route parameters, such as /notes/:id. */
export const resourceParamsSchema = z.strictObject({ id: resourceIdSchema });
/** No named route parameters. */
export const noParamsSchema = z.strictObject({});

export type ResourceId = z.infer<typeof resourceIdSchema>;
export type Revision = z.infer<typeof revisionSchema>;
