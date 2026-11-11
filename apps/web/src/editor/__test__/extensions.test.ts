// @vitest-environment happy-dom
import { Editor, getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { editorExtensions, markdownManager } from '../extensions.js';
import { isSafeLink } from '../links.js';

const fixtures = [
  ['paragraphs', 'First paragraph.\n\nSecond paragraph.'],
  [
    'headings',
    '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six',
  ],
  ['marks', '**bold** *italic* ~~strike~~ `literal <script>`'],
  ['nested marks', '**bold and *italic* text**'],
  ['links', '[Example](https://example.com/path "Title") and [jump](#section)'],
  ['lists', '- one\n- two\n  - nested\n\n3. third\n4. fourth'],
  ['tasks', '- [ ] pending\n- [x] done\n  - [ ] nested'],
  ['quotes', '> Quoted **text**\n>\n> > Nested quote'],
  ['rules', 'Above\n\n---\n\nBelow'],
  ['hard breaks', 'one  \ntwo'],
  ['literal code', '````text\n<script>alert(1)</script>\n```\n````'],
  ['Mermaid', '```mermaid\nflowchart LR\n  A --> B\n```'],
  ['invalid diagram', '```mermaid\nnot a valid diagram <script>\n```'],
  [
    'multiple diagrams',
    '```mermaid\nA --> B\n```\n\nBetween\n\n```mermaid\nsequenceDiagram\nA->>B: Hi\n```',
  ],
] as const;

describe('editor extension compatibility', () => {
  it.each(fixtures)(
    'round-trips %s through the real editor schema',
    (_name, source) => {
      const manager = markdownManager();
      const schema = getSchema(editorExtensions());
      const document = schema.nodeFromJSON(manager.parse(source));
      document.check();
      const serialized = manager.serialize(document.toJSON());
      const reopened = schema.nodeFromJSON(manager.parse(serialized));
      expect(reopened.eq(document)).toBe(true);
    },
  );

  it('mounts literal code and Mermaid without creating active HTML', () => {
    const manager = markdownManager();
    const source =
      '```html\n<img src=x onerror=alert(1)>\n```\n\n```mermaid\n<script>alert(1)</script>\n```';
    const editor = new Editor({
      extensions: editorExtensions(),
      content: manager.parse(source),
    });
    try {
      expect(editor.view.dom.querySelector('img, script, iframe')).toBeNull();
      expect(editor.view.dom.textContent).toContain(
        '<script>alert(1)</script>',
      );
      expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
        'codeBlock',
        'mermaid',
      ]);
    } finally {
      editor.destroy();
    }
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'vbscript:x',
    '//evil.example',
    'java\nscript:x',
    '\\evil.example',
    'javascript&colon;x',
  ])('rejects unsafe link %#', (href) => expect(isSafeLink(href)).toBe(false));
  it.each([
    'https://example.com',
    'http://localhost:3001',
    'mailto:me@example.com',
    '#heading',
    '/notes',
    '../notes',
  ])('allows supported link %s', (href) => expect(isSafeLink(href)).toBe(true));
});
