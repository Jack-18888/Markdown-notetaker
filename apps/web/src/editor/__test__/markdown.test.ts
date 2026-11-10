// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { loadMarkdown, MarkdownConversionError } from '../markdown.js';
import { supportedFixtures } from './fixtures.js';

describe('source-retaining conversion boundary', () => {
  it.each(supportedFixtures)(
    'keeps %s editable through the public boundary',
    (_name, source) => {
      const loaded = loadMarkdown(source);
      expect(loaded.mode).toBe('rich');
      if (loaded.mode !== 'rich')
        throw new Error('Supported fixture unexpectedly fell back.');
      loaded.document.content!.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Another paragraph' }],
      });
      const reopened = loadMarkdown(loaded.serialize(loaded.document));
      expect(reopened.mode).toBe('rich');
      if (reopened.mode !== 'rich')
        throw new Error('Edited fixture unexpectedly fell back.');
      expect(reopened.document).toEqual(loaded.document);
    },
  );
  it.each([
    '',
    '# Heading\r\n\r\nText.  \r\nNext\r\n',
    '- item\n\n\n- second\n',
    '~~~js\nconst example = 1;\n~~~\n',
  ])('returns untouched original source %#', (source) => {
    const loaded = loadMarkdown(source);
    expect(loaded.mode).toBe('rich');
    if (loaded.mode !== 'rich') throw new Error('Expected supported fixture.');
    expect(loaded.serialize(loaded.document)).toBe(source);
  });

  it.each([
    '<script>alert(1)</script>',
    '![image](https://example.com/image.png)',
    '| A | B |\n| --- | --- |\n| x | y |',
    '---\r\ntitle: Original\r\n---\r\nBody',
    '[unsafe](javascript:alert%281%29)',
    '\ufeff# Preserved',
    '> ```mermaid\n> A --> B\n> ```',
    '```mermaid\nA --> B',
  ])('retains fallback bytes and exposes no lossy document %#', (source) => {
    const loaded = loadMarkdown(source);
    expect(loaded.mode).toBe('source');
    expect(loaded.source).toBe(source);
    expect(loaded).not.toHaveProperty('document');
    expect(loaded).not.toHaveProperty('serialize');
  });

  it.each(['\n', '\r\n', '\r'])(
    'retains exact diagram payloads across other body edits (%j)',
    (ending) => {
      const diagram = ['flowchart LR', '  A --> B  ', ''].join(ending);
      const source =
        'Before' +
        ending +
        ending +
        '~~~mermaid' +
        ending +
        diagram +
        ending +
        '~~~' +
        ending;
      const loaded = loadMarkdown(source);
      expect(loaded.mode).toBe('rich');
      if (loaded.mode !== 'rich') throw new Error('Expected editable diagram.');
      expect(loaded.document.content?.[1]?.attrs?.source).toBe(diagram);
      // Mutating the caller's JSON cannot mutate the captured baseline.
      loaded.document.content!.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'After' }],
      });
      const saved = loaded.serialize(loaded.document);
      expect(saved).not.toBe(source);
      const reopened = loadMarkdown(saved);
      expect(reopened.mode).toBe('rich');
      if (reopened.mode !== 'rich')
        throw new Error('Expected safe saved diagram.');
      expect(reopened.document.content?.[1]?.attrs?.source).toBe(diagram);
    },
  );

  it('keeps multiple diagrams and nested backticks in source order', () => {
    const source =
      '````mermaid\nA["```"] --> B\n````\n\n```mermaid\nsequenceDiagram\nA->>B: Hi\n```';
    const loaded = loadMarkdown(source);
    expect(loaded.mode).toBe('rich');
    if (loaded.mode !== 'rich') throw new Error('Expected safe diagrams.');
    loaded.document.content!.push({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Edited' }],
    });
    const reopened = loadMarkdown(loaded.serialize(loaded.document));
    expect(reopened.mode).toBe('rich');
    if (reopened.mode !== 'rich')
      throw new Error('Expected safe diagrams after edit.');
    expect(
      reopened.document.content?.slice(0, 2).map((node) => node.attrs?.source),
    ).toEqual(['A["```"] --> B', 'sequenceDiagram\nA->>B: Hi']);
  });

  it('refuses unsupported nodes, unsafe links, invalid attributes, and excessive nesting', () => {
    const loaded = loadMarkdown('Original');
    if (loaded.mode !== 'rich') throw new Error('Expected simple document.');
    const text = {
      type: 'text',
      text: 'unsafe',
      marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
    };
    let nested = { type: 'blockquote', content: [{ type: 'paragraph' }] };
    for (let index = 0; index < 40; index++)
      nested = { type: 'blockquote', content: [nested] };
    for (const node of [
      { type: 'image', attrs: { src: 'https://example.com/image.png' } },
      { type: 'paragraph', content: [text] },
      { type: 'mermaid', attrs: { source: 42 } },
      { type: 'codeBlock', attrs: { language: 'js\n```' } },
      nested,
    ])
      expect(() => loaded.serialize({ type: 'doc', content: [node] })).toThrow(
        MarkdownConversionError,
      );
    expect(loaded.source).toBe('Original');
    expect(loaded.serialize(loaded.document)).toBe('Original');
  });
});
