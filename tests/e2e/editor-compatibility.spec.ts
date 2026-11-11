import { expect, test } from '@playwright/test';

test('real editor edits retain Mermaid through the API and a browser reload', async ({
  page,
}) => {
  await page.goto('/');
  const source =
    '# Browser\r\n\r\n```mermaid\r\nflowchart LR\r\n A --> B  \r\n```\r\n';
  const result = await page.evaluate(async (content) => {
    const path = '/src/editor/__test__/browser-fixture.ts';
    const { Editor, editorExtensions, loadMarkdown, noteDetailSchema } =
      await import(/* @vite-ignore */ path);
    const created = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Editor fixture',
        folderId: null,
        content,
      }),
    });
    if (created.status !== 201) throw new Error('Fixture creation failed.');
    const note = noteDetailSchema.parse(await created.json());
    const loaded = loadMarkdown(note.content);
    if (loaded.mode !== 'rich') throw new Error('Fixture is not editable.');
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new Editor({
      element: host,
      extensions: editorExtensions(),
      content: loaded.document,
    });
    try {
      const original = loaded.serialize(editor.getJSON());
      editor.commands.insertContentAt(editor.state.doc.content.size, {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Edited in the real browser' }],
      });
      const saved = loaded.serialize(editor.getJSON());
      const updated = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 1, content: saved }),
      });
      return { id: note.id as string, original, saved, status: updated.status };
    } finally {
      editor.destroy();
      host.remove();
    }
  }, source);
  expect(result.original).toBe(source);
  expect(result.status).toBe(200);
  await page.reload();
  const reopened = await page.evaluate(async (id) => {
    const path = '/src/editor/__test__/browser-fixture.ts';
    const { loadMarkdown, noteDetailSchema } = await import(
      /* @vite-ignore */ path
    );
    const response = await fetch(`/api/notes/${id}`);
    const note = noteDetailSchema.parse(await response.json());
    const loaded = loadMarkdown(note.content);
    if (loaded.mode !== 'rich')
      throw new Error('Saved source is not editable.');
    return {
      content: note.content,
      document: loaded.document,
      revision: note.revision,
    };
  }, result.id);
  expect(reopened.content).toBe(result.saved);
  expect(reopened.revision).toBe(2);
  expect(reopened.document.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'mermaid',
        attrs: { source: 'flowchart LR\r\n A --> B  ' },
      }),
    ]),
  );
});

test('source fallback is literal, keyboard reachable, and contained on narrow screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const source =
    '---\r\ntitle: Keep source\r\n---\r\n<img src=x onerror=alert(1)>\r\n[unsafe](javascript:alert(1))\r\n' +
    'unbroken-source-'.repeat(30);
  await page.evaluate(async (source) => {
    const path = '/src/editor/__test__/browser-fixture.ts';
    const { createElement, createRoot, SourceFallback, loadMarkdown } =
      await import(/* @vite-ignore */ path);
    const loaded = loadMarkdown(source);
    if (loaded.mode !== 'source') throw new Error('Expected source fallback.');
    const host = document.createElement('div');
    host.style.padding = '24px';
    document.body.append(host);
    createRoot(host).render(
      createElement(SourceFallback, { document: loaded }),
    );
  }, source);
  const region = page.getByRole('region', { name: 'Markdown source' });
  await expect(region).toBeVisible();
  const view = region.getByLabel('Read-only Markdown source');
  expect(await view.textContent()).toBe(source);
  await expect(
    region.locator('img, script, iframe, a, textarea, [contenteditable]'),
  ).toHaveCount(0);
  await view.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(view).toBeFocused();
  expect(
    await view.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).toBe('solid');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await region.screenshot({ path: 'test-results/source-fallback.png' });
});
