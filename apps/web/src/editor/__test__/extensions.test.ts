// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { setEditorLink } from '../commands.js';
import { isSafeLink } from '../links.js';
import { rich, select } from './editor-fixture.js';

describe('mounted Milkdown schema', () => {
  it('renders code and Mermaid literally without active HTML', async () => {
    const { view, close } = await rich(
      '```html\n<img src=x onerror=alert(1)>\n```\n\n```mermaid\n<script>alert(1)</script>\n```',
    );
    try {
      expect(view.dom.querySelector('img, script, iframe')).toBeNull();
      expect(view.dom.textContent).toContain('<script>alert(1)</script>');
      expect(view.state.doc.child(0).type.name).toBe('code_block');
      expect(view.state.doc.child(1).type.name).toBe('mermaid');
    } finally {
      close();
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
  ])('rejects unsafe link %# in both policy and commands', async (href) => {
    expect(isSafeLink(href)).toBe(false);
    const { view, close } = await rich();
    try {
      select(view);
      expect(setEditorLink(view, href)).toBe(false);
      expect(view.dom.querySelector('a')).toBeNull();
    } finally {
      close();
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
