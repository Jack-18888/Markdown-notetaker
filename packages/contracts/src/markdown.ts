import { z } from 'zod';
import { limits, utf8ByteLength } from './limits.ts';

export enum MarkdownValidationReason {
  BYTE_LIMIT = 'byte_limit',
}

/** Raw Markdown, preserved verbatim; rendering belongs to the frontend. */
export const markdownSchema = z
  .string()
  .refine((value) => utf8ByteLength(value) <= limits.markdownBytes, {
    message: 'Markdown exceeds its UTF-8 byte limit.',
    params: { markdownReason: MarkdownValidationReason.BYTE_LIMIT },
  })
  .refine((value) => {
    for (const character of value) {
      const point = character.codePointAt(0)!;
      if (point >= 0xd800 && point <= 0xdfff) return false;
    }
    return true;
  }, 'Markdown must contain well-formed Unicode.');

export type Markdown = z.infer<typeof markdownSchema>;
