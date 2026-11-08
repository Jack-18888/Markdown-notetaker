import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  documentEnvelopeSchema,
  documentSchemaVersion,
  DocumentValidationReason,
  limits,
} from '@markdown-note-taker/contracts';

function documentWithText(text: unknown) {
  return {
    schemaVersion: documentSchemaVersion,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  };
}

function expectViolation(input: unknown, reason: DocumentValidationReason) {
  const result = documentEnvelopeSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        code: 'custom',
        params: { documentReason: reason },
      }),
    );
  }
}

describe('documentEnvelopeSchema limits', () => {
  it('accepts a valid document without an object prototype', () => {
    const document = createEmptyDocument();
    const input = Object.assign(Object.create(null), document);
    expect(documentEnvelopeSchema.parse(input)).toEqual(document);
  });

  it('includes envelope overhead at the exact byte boundary', () => {
    const overhead = Buffer.byteLength(
      JSON.stringify(documentWithText('')),
      'utf8',
    );
    const fitting = documentWithText(
      'x'.repeat(limits.documentBytes - overhead),
    );
    expect(Buffer.byteLength(JSON.stringify(fitting), 'utf8')).toBe(
      limits.documentBytes,
    );
    expect(documentEnvelopeSchema.parse(fitting)).toEqual(fitting);
    expectViolation(
      documentWithText('x'.repeat(limits.documentBytes - overhead + 1)),
      DocumentValidationReason.BYTE_LIMIT,
    );
  });

  it('rejects raw text exceeding the byte cap', () => {
    expectViolation(
      documentWithText('x'.repeat(limits.documentBytes + 1)),
      DocumentValidationReason.BYTE_LIMIT,
    );
  });

  it.each([
    '\u{1f4dd}'.repeat(limits.documentBytes / 4),
    '\u0000'.repeat(Math.ceil(limits.documentBytes / 6)),
  ])('counts UTF-8 expansion and JSON escaping (%#)', (text) => {
    const document = documentWithText(text);
    expect(text.length).toBeLessThan(limits.documentBytes);
    expect(Buffer.byteLength(JSON.stringify(document), 'utf8')).toBeGreaterThan(
      limits.documentBytes,
    );
    expectViolation(document, DocumentValidationReason.BYTE_LIMIT);
  });

  it('rejects oversized property names before reporting unknown fields', () => {
    const document = {
      ...createEmptyDocument(),
      ['x'.repeat(limits.documentBytes + 1)]: null,
    };
    expectViolation(document, DocumentValidationReason.BYTE_LIMIT);
  });

  it.each([
    ['objects', (value: unknown): unknown => ({ child: value })],
    ['arrays', (value: unknown): unknown => [value]],
  ] as const)(
    'checks the inclusive depth cap before unsupported %s',
    (_name, wrap) => {
      let nested: unknown = null;
      for (let depth = 1; depth < limits.documentDepth; depth++)
        nested = wrap(nested);
      const atLimit = { ...createEmptyDocument(), probe: nested };
      const result = documentEnvelopeSchema.safeParse(atLimit);
      expect(result.success).toBe(false);
      // This format rejects the extra field, but the nesting itself is within budget.
      if (!result.success) {
        expect(result.error.issues).toEqual([
          expect.objectContaining({
            code: 'unrecognized_keys',
            keys: ['probe'],
            path: [],
          }),
        ]);
      }
      expectViolation(
        { ...atLimit, probe: wrap(nested) },
        DocumentValidationReason.DEPTH_LIMIT,
      );
    },
  );

  it('accepts exactly the value cap and rejects one extra value', () => {
    const document = createEmptyDocument();
    // Envelope/root use 5 values; paragraphs use 2 each, plus one empty content array.
    document.content.content = Array.from(
      { length: (limits.documentValues - 6) / 2 },
      () => ({ type: 'paragraph' }),
    );
    document.content.content[0]!.content = [];
    expect(documentEnvelopeSchema.parse(document).content.content).toHaveLength(
      document.content.content.length,
    );
    document.content.content[1]!.content = [];
    expectViolation(document, DocumentValidationReason.VALUE_LIMIT);
  });

  it('combines values across sibling paragraphs', () => {
    const document = {
      schemaVersion: documentSchemaVersion,
      content: {
        type: 'doc',
        content: Array.from({ length: 2 }, () => ({
          type: 'paragraph',
          content: Array.from(
            { length: Math.floor(limits.documentValues / 6) },
            () => ({ type: 'text', text: 'x' }),
          ),
        })),
      },
    };
    expectViolation(document, DocumentValidationReason.VALUE_LIMIT);
  });

  it('rejects sparse content before holes can bypass the value budget', () => {
    const document = createEmptyDocument();
    document.content.content = new Array(limits.documentValues * 2);
    expectViolation(document, DocumentValidationReason.INVALID_JSON);
  });

  it.each([
    { value: undefined, label: 'undefined' },
    { value: Number.NaN, label: 'NaN' },
    { value: Infinity, label: 'infinity' },
    { value: -Infinity, label: 'negative infinity' },
    { value: BigInt(1), label: 'bigint' },
    { value: () => null, label: 'function' },
    { value: Symbol('example'), label: 'symbol' },
    { value: new Date(), label: 'Date' },
    { value: new Map(), label: 'Map' },
  ])('rejects non-JSON $label in a document', ({ value }) => {
    expectViolation(
      documentWithText(value),
      DocumentValidationReason.INVALID_JSON,
    );
  });

  it('rejects custom serializers without calling them', () => {
    let called = false;
    const text = {
      toJSON() {
        called = true;
        return 'text';
      },
    };
    expectViolation(
      documentWithText(text),
      DocumentValidationReason.INVALID_JSON,
    );
    expect(called).toBe(false);
  });

  it('rejects cyclic content with a depth diagnostic', () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expectViolation(
      documentWithText(cycle),
      DocumentValidationReason.DEPTH_LIMIT,
    );
  });
});
