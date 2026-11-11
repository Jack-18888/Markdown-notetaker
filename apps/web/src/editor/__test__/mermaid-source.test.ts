// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { markdownManager } from '../extensions.js';
import { loadMarkdown } from '../markdown.js';
import { restoreMermaidSource } from '../mermaid-source.js';

describe('diagram payload recovery from top-level tokens', () => {
  it.each(['\n', '\r\n', '\r'])(
    'ignores fence-looking code inside a list and retains original payload bytes (%j)',
    (ending) => {
      const payload = ['flowchart LR', '  RIGHT --> B  ', ''].join(ending);
      const source = [
        '# Before 😀',
        '',
        '- ~~~text',
        '  ```mermaid',
        '  WRONG',
        '  ```',
        '  ~~~',
        '',
        '```mermaid',
        payload,
        '```',
      ].join(ending);
      const document = markdownManager().parse(source);
      restoreMermaidSource(document, source);
      expect(
        document.content!.find((node) => node.type === 'mermaid')!.attrs!
          .source,
      ).toBe(payload);
      // A separate parser/serializer mismatch may still require safe fallback.
      const loaded = loadMarkdown(source);
      expect(loaded.source).toBe(source);
      if (loaded.mode === 'rich') {
        loaded.document.content!.push({
          type: 'paragraph',
          content: [{ type: 'text', text: 'Unrelated edit' }],
        });
        expect(loaded.serialize(loaded.document)).toContain(payload);
      }
    },
  );

  it('does not promote a literal diagram inside a list into a real diagram', () => {
    const source = '- ~~~text\n  ```mermaid\n  WRONG\n  ```\n  ~~~';
    const document = markdownManager().parse(source);
    expect(() => restoreMermaidSource(document, source)).not.toThrow();
    expect(document.content!.some((node) => node.type === 'mermaid')).toBe(
      false,
    );
  });

  it('maps mixed line endings and repeated code payloads to their own positions', () => {
    const source =
      'Before\r\n\n```text\rA --> B\r```\n\n~~~mermaid\r\nA --> B  \r\n~~~\r\n\n```mermaid\rA --> C\r```';
    const document = markdownManager().parse(source);
    restoreMermaidSource(document, source);
    expect(
      document
        .content!.filter((node) => node.type === 'mermaid')
        .map((node) => node.attrs!.source),
    ).toEqual(['A --> B  ', 'A --> C']);
  });
});
