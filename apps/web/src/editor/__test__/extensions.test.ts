// @vitest-environment happy-dom
import { Editor, getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { editorExtensions, markdownManager } from '../extensions.js';
import { isSafeLink } from '../links.js';
import { supportedFixtures } from './fixtures.js';

describe('editor extension compatibility', () => {
  it.each(supportedFixtures)(
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
  ])('rejects unsafe link %# in both policy and editor commands', (href) => {
    expect(isSafeLink(href)).toBe(false);
    const editor = new Editor({
      extensions: editorExtensions(),
      content: '<p>Text</p>',
    });
    try {
      editor.commands.selectAll();
      expect(editor.commands.setLink({ href })).toBe(false);
      expect(editor.view.dom.querySelector('a')).toBeNull();
    } finally {
      editor.destroy();
    }
  });
  it.each([
    'https://example.com',
    'http://localhost:3001',
    'mailto:me@example.com',
    '#heading',
    '/notes',
    '../notes',
  ])('allows supported link %s', (href) => expect(isSafeLink(href)).toBe(true));
});
