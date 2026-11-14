// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SourceFallback from '../SourceFallback.js';
import { open } from './editor-fixture.js';

describe('source fallback view', () => {
  it('escapes hostile source, labels the view, and preserves selectable text', async () => {
    const source =
      '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[unsafe](javascript:alert(1))';
    const { loaded: document, close } = await open(source);
    close();
    if (document.mode !== 'source')
      throw new Error('Expected source fallback.');
    const container = globalThis.document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      createElement(SourceFallback, { document }),
    );
    expect(
      container.querySelector(
        'script, img, iframe, a, textarea, [contenteditable]',
      ),
    ).toBeNull();
    const view = container.querySelector('pre')!;
    expect(view.textContent).toBe(source);
    expect(view.getAttribute('aria-label')).toBe('Read-only Markdown source');
    expect(view.tabIndex).toBe(0);
    expect(container.textContent).toContain('Your Markdown is preserved.');
  });
});
