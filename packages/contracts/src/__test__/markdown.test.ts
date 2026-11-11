import { describe, expect, it } from 'vitest';
import {
  limits,
  markdownSchema,
  MarkdownValidationReason,
  utf8ByteLength,
} from '@markdown-note-taker/contracts';

describe('raw Markdown validation', () => {
  it.each([
    '',
    '\ufeff# Heading\r\n\r\n**bold**  \r\n\tindented\r\n',
    '| A | B |\n| --- | --- |\n| 1 | 2 |\n',
    '```mermaid\nflowchart LR\n A --> B\n```\n',
    '<script>literal source</script> [link](javascript:alert(1))',
    '\u{1f4dd} \u00e9 e\u0301\n\u0000',
  ])('preserves the entire source verbatim (%#)', (content) => {
    expect(markdownSchema.parse(content)).toBe(content);
    expect(utf8ByteLength(content)).toBe(Buffer.byteLength(content, 'utf8'));
  });

  it.each([
    'x'.repeat(limits.markdownBytes),
    '\u{1f4dd}'.repeat(limits.markdownBytes / 4),
    '\u0000'.repeat(limits.markdownBytes),
  ])(
    'accepts the inclusive UTF-8 byte cap without counting JSON escaping (%#)',
    (content) => {
      expect(Buffer.byteLength(content, 'utf8')).toBe(limits.markdownBytes);
      expect(markdownSchema.parse(content)).toBe(content);
      const rejected = markdownSchema.safeParse(content + 'x');
      expect(rejected.success).toBe(false);
      if (!rejected.success)
        expect(rejected.error.issues).toContainEqual(
          expect.objectContaining({
            params: { markdownReason: MarkdownValidationReason.BYTE_LIMIT },
          }),
        );
    },
  );

  it.each([
    null,
    undefined,
    12,
    true,
    [],
    {},
    { schemaVersion: 1, content: { type: 'doc' } },
  ])('rejects non-string content without coercion (%#)', (content) => {
    expect(markdownSchema.safeParse(content).success).toBe(false);
  });

  it.each(['\ud800', '\udfff', 'text\ud800suffix'])(
    'rejects malformed Unicode (%#)',
    (content) => {
      expect(markdownSchema.safeParse(content).success).toBe(false);
    },
  );
});
