import { expect, test } from '@playwright/test';

test('the actual renderer handles flowchart, sequence, invalid, blocked, and canceled work without leaking DOM', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/editor/__test__/browser-fixture.ts';
    const { renderDiagram } = await import(/* @vite-ignore */ path);
    const results = [];
    for (const source of [
      'flowchart LR\n A --> B',
      'sequenceDiagram\n Alice->>Bob: Hello',
      'invalid diagram source',
      '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A --> B',
    ]) {
      const result = await renderDiagram(source, new AbortController().signal);
      results.push(result?.kind);
    }
    const controller = new AbortController();
    controller.abort();
    const canceled = await renderDiagram(
      'flowchart LR\n A --> B',
      controller.signal,
    );
    return {
      results,
      canceled,
      temporary: document.querySelectorAll('[data-diagram-render]').length,
    };
  });
  expect(result).toEqual({
    results: ['ready', 'ready', 'message', 'message'],
    canceled: null,
    temporary: 0,
  });
});

test('the SVG boundary removes active markup, HTML, images, and links while retaining geometry', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/editor/__test__/browser-fixture.ts';
    const { sanitizeDiagram } = await import(/* @vite-ignore */ path);
    const host = document.createElement('div');
    host.innerHTML = sanitizeDiagram(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><img src="x" onerror="alert(1)"></foreignObject><a href="javascript:alert(1)"><text>Safe label</text></a><image href="https://example.com/image.png"/><path d="M0 0 L10 10" /></svg>',
    );
    return {
      active: !!host.querySelector(
        'script, foreignObject, img, image, a, [onload], [onerror], [href]',
      ),
      geometry: host.querySelector('path')?.getAttribute('d'),
    };
  });
  expect(result).toEqual({ active: false, geometry: 'M0 0 L10 10' });
});
