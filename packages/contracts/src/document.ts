import { z } from 'zod';
import { limits, utf8ByteLength } from './limits.ts';

/** Document format version, separate from the note's edit counter. */
export const documentSchemaVersion = 1;

/** Document preflight failures; diagnostic string values stay stable. */
export enum DocumentValidationReason {
  BYTE_LIMIT = 'byte_limit',
  VALUE_LIMIT = 'value_limit',
  DEPTH_LIMIT = 'depth_limit',
  INVALID_JSON = 'invalid_json',
}

// Internal diagnostics; public errors use fixed messages.
const documentValidationMessages: Record<DocumentValidationReason, string> = {
  [DocumentValidationReason.BYTE_LIMIT]:
    'Document exceeds the UTF-8 byte limit.',
  [DocumentValidationReason.VALUE_LIMIT]:
    'Document contains too many JSON values.',
  [DocumentValidationReason.DEPTH_LIMIT]: 'Document is nested too deeply.',
  [DocumentValidationReason.INVALID_JSON]:
    'Document must contain plain JSON values.',
};

/** Check JSON representation and byte/depth/value caps from limits. */
function getDocumentLimitViolation(
  input: unknown,
): DocumentValidationReason | undefined {
  // Walk iteratively so untrusted nesting cannot exhaust the call stack.
  const pending: { value: unknown; depth: number }[] = [
    { value: input, depth: 0 },
  ];
  let values = 0;
  let characters = 0;

  while (pending.length) {
    const { value, depth } = pending.pop()!;
    // Include queued values before expanding another container.
    if (
      ++values > limits.documentValues ||
      pending.length + values > limits.documentValues
    ) {
      return DocumentValidationReason.VALUE_LIMIT;
    }
    if (depth > limits.documentDepth)
      return DocumentValidationReason.DEPTH_LIMIT;

    if (typeof value === 'string') {
      characters += value.length;
    } else if (value !== null && typeof value === 'object') {
      const isArray = Array.isArray(value);
      // Only plain objects and arrays are accepted as JSON containers.
      if (
        !isArray &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      ) {
        return DocumentValidationReason.INVALID_JSON;
      }
      const keys = Object.keys(value);
      if (keys.length + pending.length + values > limits.documentValues) {
        return DocumentValidationReason.VALUE_LIMIT;
      }
      // Holes escape the value count but serialize as null entries.
      if (isArray && keys.length !== value.length)
        return DocumentValidationReason.INVALID_JSON;
      for (const key of keys) {
        if (!isArray) characters += key.length;
        pending.push({
          value: (value as Record<string, unknown>)[key],
          depth: depth + 1,
        });
      }
    } else if (
      value !== null &&
      typeof value !== 'boolean' &&
      !(typeof value === 'number' && Number.isFinite(value))
    ) {
      return DocumentValidationReason.INVALID_JSON;
    }
    // Raw character count cheaply bounds allocation before serialization.
    if (characters > limits.documentBytes)
      return DocumentValidationReason.BYTE_LIMIT;
  }

  // The final count includes UTF-8 expansion, JSON punctuation, and escaping.
  if (utf8ByteLength(JSON.stringify(input)) > limits.documentBytes) {
    return DocumentValidationReason.BYTE_LIMIT;
  }
  return undefined;
}

/** Validate JSON and resource caps before checking editor nodes. */
const jsonWithinDocumentLimitsSchema = z
  .unknown()
  .superRefine((value, context) => {
    const reason = getDocumentLimitViolation(value);
    if (reason)
      context.addIssue({
        code: 'custom',
        message: documentValidationMessages[reason],
        params: { documentReason: reason },
      });
  });

/** Literal inline text. */
const textSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
});
/** Text-run block; an empty block is an editable blank line. */
const paragraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  content: z.array(textSchema).optional(),
});

/** Initial paragraph-only editor tree, stored as one JSON document. */
const richDocumentSchema = z.strictObject({
  type: z.literal('doc'),
  content: z.array(paragraphSchema).min(1),
});

/** Versioned editor document validated for JSON limits and node structure. */
export const documentEnvelopeSchema = jsonWithinDocumentLimitsSchema.pipe(
  z.strictObject({
    schemaVersion: z.literal(documentSchemaVersion),
    content: richDocumentSchema,
  }),
);

export type DocumentEnvelope = z.infer<typeof documentEnvelopeSchema>;
export type RichDocument = z.infer<typeof richDocumentSchema>;

/** Fresh blank document so notes never share mutable nodes. */
export function createEmptyDocument(): DocumentEnvelope {
  return {
    schemaVersion: documentSchemaVersion,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  };
}
