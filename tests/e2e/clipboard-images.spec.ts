import type { Page } from '@playwright/test';
import { expect, test } from './note-fixtures.js';
import { openActionDisclosure } from './workspace-controls.js';

async function pasteImage(
  page: Page,
  mime = 'image/png',
  count = 1,
  width = 16,
) {
  return page
    .getByRole('textbox', { name: 'Note content', exact: true })
    .evaluate(
      (editor, { mime, count, width }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = width / 2;
        canvas.getContext('2d')!.fillRect(0, 0, width, width / 2);
        const binary = atob(canvas.toDataURL(mime).split(',')[1]!);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const clipboard = new DataTransfer();
        for (let i = 0; i < count; i++)
          clipboard.items.add(new File([bytes], 'clipboard', { type: mime }));
        return !editor.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: clipboard,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { mime, count, width },
    );
}

for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
  test(`pastes ${mime}, renders, saves, exports local links, and reopens`, async ({
    page,
    notes,
  }) => {
    const note = await notes.create(`Clipboard ${mime}`);
    await page.goto('/');
    await page
      .getByRole('button', { name: `Open note Clipboard ${mime}`, exact: true })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.press('ControlOrMeta+End');
    expect(await pasteImage(page, mime)).toBe(true);
    const image = body.getByRole('img', { name: 'Pasted image', exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(16);
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    const saved = await notes.read(note.id);
    expect(saved.content).toMatch(
      /!\[Pasted image\]\(\/api\/images\/[a-f0-9-]+\)/,
    );
    await openActionDisclosure(page, 'Note actions');
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Export Markdown', exact: true })
      .click();
    const stream = await (await download).createReadStream();
    const chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString('utf8')).toBe(saved.content);
    await page.reload();
    await page
      .getByRole('button', { name: `Open note Clipboard ${mime}`, exact: true })
      .click();
    await expect(
      body.getByRole('img', { name: 'Pasted image', exact: true }),
    ).toBeVisible();
  });
}

test('navigation waits for upload and newer typing before saving', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Uploading image');
  await notes.create('Image destination');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Uploading image', exact: true })
    .click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let uploaded = false;
  await page.route('**/api/images', async (route) => {
    const response = await route.fetch();
    uploaded = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.press('ControlOrMeta+End');
    await pasteImage(page);
    await expect.poll(() => uploaded).toBe(true);
    await page
      .getByRole('navigation', { name: 'Workspace folders' })
      .getByRole('button', { name: 'Image destination', exact: true })
      .click();
    await expect(body.getByText('Uploading image…')).toBeVisible();
    await body.press('ControlOrMeta+End');
    await body.pressSequentially(' latest text');
    expect((await notes.read(note.id)).content).toBe('Original');
    release();
    await expect(
      page.getByRole('heading', { name: 'Image destination', exact: true }),
    ).toBeVisible();
    const saved = await notes.read(note.id);
    expect(saved.content).toContain('latest text');
    expect(saved.content).toContain('![Pasted image](/api/images/');
  } finally {
    release();
  }
});

test('failed uploads retain retry/remove and block saves until resolved', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Retry image');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Retry image', exact: true })
    .click();
  await page.route('**/api/images', (route) => route.abort());
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await body.press('ControlOrMeta+End');
  await pasteImage(page);
  await expect(
    page.getByRole('button', { name: 'Retry image upload' }),
  ).toBeVisible();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toBe('Original');
  await page.unroute('**/api/images');
  await page.getByRole('button', { name: 'Retry image upload' }).click();
  await expect(
    body.getByRole('img', { name: 'Pasted image', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await page.route('**/api/images', (route) => route.abort());
  await body.press('ControlOrMeta+End');
  await pasteImage(page);
  await expect(
    page.getByRole('button', { name: 'Retry image upload' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove pasted image' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  expect((await notes.read(note.id)).content.match(/!\[/g)).toHaveLength(1);
});

test('undo removes an uploading placeholder and ignores its late response', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Undo image');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Undo image', exact: true })
    .click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route('**/api/images', async (route) => {
    const response = await route.fetch();
    started = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.press('ControlOrMeta+End');
    await pasteImage(page);
    await expect.poll(() => started).toBe(true);
    await body.press('ControlOrMeta+z');
    await expect(
      page.getByRole('button', { name: 'Remove pasted image' }),
    ).toHaveCount(0);
    release();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    expect((await notes.read(note.id)).content).toBe('Original');
    await expect(body.locator('.note-image')).toHaveCount(0);
  } finally {
    release();
  }
});

test('rejects unsupported and multiple images without changing the note', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Invalid image');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Invalid image', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await body.click();
  await pasteImage(page, 'image/svg+xml');
  await expect(
    page.getByText('Paste one PNG, JPEG, or WebP image of 5 MiB or less.'),
  ).toBeVisible();
  await pasteImage(page, 'image/png', 2);
  await expect(body).toHaveText('Original');
  expect((await notes.read(note.id)).content).toBe('Original');
});

test('export waits for upload and preserves edits made while waiting', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Export pending image');
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Export pending image',
      exact: true,
    })
    .click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  let downloaded = false;
  page.on('download', () => {
    downloaded = true;
  });
  await page.route('**/api/images', async (route) => {
    const response = await route.fetch();
    started = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await body.press('ControlOrMeta+End');
    await pasteImage(page);
    await expect.poll(() => started).toBe(true);
    await openActionDisclosure(page, 'Note actions');
    await page
      .getByRole('button', { name: 'Export Markdown', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Preparing download…', exact: true }),
    ).toBeVisible();
    expect(downloaded).toBe(false);
    await body.press('ControlOrMeta+End');
    await body.pressSequentially(' export latest');
    const download = page.waitForEvent('download');
    release();
    const stream = await (await download).createReadStream();
    const chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const saved = await notes.read(note.id);
    expect(Buffer.concat(chunks).toString('utf8')).toBe(saved.content);
    expect(saved.content).toContain('export latest');
    expect(saved.content).toContain('![Pasted image](/api/images/');
  } finally {
    release();
  }
});

test('completed paste supports undo and redo without repeating the upload', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Image history');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Image history', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  let uploads = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/images'))
      uploads++;
  });
  await body.press('ControlOrMeta+End');
  await pasteImage(page);
  await expect(body.locator('.note-image')).toHaveCount(1);
  await body.press('ControlOrMeta+z');
  await expect(body.locator('.note-image')).toHaveCount(0);
  await body.press('ControlOrMeta+Shift+z');
  await expect(body.locator('.note-image')).toHaveCount(1);
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  expect(uploads).toBe(1);
  expect((await notes.read(note.id)).content).toContain(
    '![Pasted image](/api/images/',
  );
});

test('oversized image paste leaves the note unchanged', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Large image');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Large image', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await body.click();
  await body.evaluate((editor) => {
    const clipboard = new DataTransfer();
    clipboard.items.add(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
        type: 'image/png',
      }),
    );
    editor.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(
    page.getByText('Paste one PNG, JPEG, or WebP image of 5 MiB or less.'),
  ).toBeVisible();
  await expect(body).toHaveText('Original');
  expect((await notes.read(note.id)).content).toBe('Original');
});

test('large images fit the writing column and a narrow screen', async ({
  page,
  notes,
}) => {
  await notes.create('Responsive image');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Responsive image', exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await body.press('ControlOrMeta+End');
  await pasteImage(page, 'image/png', 1, 1200);
  const image = body.getByRole('img', { name: 'Pasted image', exact: true });
  await expect(image).toBeVisible();
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await image.scrollIntoViewIfNeeded();
    const dimensions = await image.evaluate((img) => {
      const rect = img.getBoundingClientRect();
      return {
        width: rect.width,
        ratio: rect.width / rect.height,
        right: rect.right,
        viewport: innerWidth,
      };
    });
    expect(dimensions.width).toBeLessThanOrEqual(width);
    expect(dimensions.right).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.ratio).toBeCloseTo(2, 1);
  }
  await page.screenshot({ path: 'test-results/clipboard-image-mobile.png' });
});
