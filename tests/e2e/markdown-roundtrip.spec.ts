import { openActionMenu } from './workspace-controls.js';
import { readFile } from 'node:fs/promises';
import { noteDetailSchema } from '@markdown-note-taker/contracts';
import {
  supportedFixtures,
  unsupportedFixtures,
  unsafeLinkFixtures,
} from '../../apps/web/src/editor/__test__/fixtures.js';
import { expect, test } from './note-fixtures.js';

const fixtures = [
  ...supportedFixtures.map(([label, source]) => ({
    label,
    source,
    fallback: false,
  })),
  ...unsupportedFixtures.map(([label, source]) => ({
    label,
    source,
    fallback: true,
  })),
  ...unsafeLinkFixtures.map((source, index) => ({
    label: `unsafe link ${index}`,
    source,
    fallback: true,
  })),
  { label: 'empty', source: '', fallback: false },
  {
    label: 'BOM and mixed endings',
    source: '\ufeff# 雪 😀  \r\n\rLast\n',
    fallback: true,
  },
  { label: 'import limit', source: 'x'.repeat(256 * 1024), fallback: true },
];

for (const { label, source, fallback } of fixtures) {
  test(`file round trip retains ${label}`, async ({ page, notes }) => {
    let dialogs = 0,
      externalRequests = 0;
    page.on('dialog', async (dialog) => {
      dialogs++;
      await dialog.dismiss();
    });
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:5173/'))
        externalRequests++;
    });
    await page.goto('/');
    await openActionMenu(page, 'Workspace actions');
    await page
      .getByRole('button', { name: 'Import Markdown', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Import Markdown',
      exact: true,
    });
    await dialog.getByLabel('Markdown file', { exact: true }).setInputFiles({
      name: `${label}.md`,
      mimeType: 'text/markdown',
      buffer: Buffer.from(source),
    });
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/notes') &&
        response.request().method() === 'POST',
    );
    await dialog
      .getByRole('button', { name: 'Import note', exact: true })
      .click();
    const note = noteDetailSchema.parse(await (await created).json());
    notes.track(note.id);
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible();
    if (fallback) {
      await expect(
        page.getByRole('region', { name: 'Markdown source', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('textbox', { name: 'Note content', exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('textbox', { name: 'Note content', exact: true }),
      ).toBeVisible();
    }
    const downloaded = page.waitForEvent('download');
    await openActionMenu(page, 'Note actions');
    await page
      .getByRole('button', { name: 'Export Markdown', exact: true })
      .click();
    expect(await readFile((await (await downloaded).path())!)).toEqual(
      Buffer.from(source),
    );
    expect((await notes.read(note.id)).content).toBe(source);
    expect(dialogs).toBe(0);
    expect(externalRequests).toBe(0);
    await expect(
      page.locator(
        '.note-surface script, .note-surface iframe, .note-surface img',
      ),
    ).toHaveCount(0);
  });
}

test('supported rich edits reimport with equivalent blocks and exact Mermaid payload', async ({
  page,
  notes,
}) => {
  const diagram = 'flowchart LR\r\n  A --> B  \r\n';
  const source =
    '# Round trip\n\n**Bold** and `literal <script>`\n\n- [ ] Task\n\n```mermaid\n' +
    diagram +
    '\n```\n\nLast paragraph.';
  const original = await notes.create('Rich file round trip', source);
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Rich file round trip',
      exact: true,
    })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await body.locator(':scope > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited before export.');
  const downloaded = page.waitForEvent('download');
  await openActionMenu(page, 'Note actions');
  await page
    .getByRole('button', { name: 'Export Markdown', exact: true })
    .click();
  const bytes = await readFile((await (await downloaded).path())!);
  expect(bytes.toString('utf8')).toContain(diagram);
  expect(bytes.toString('utf8')).toContain(
    'Last paragraph. Edited before export.',
  );
  await openActionMenu(page, 'Workspace actions');
  await page
    .getByRole('button', { name: 'Import Markdown', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Import Markdown',
    exact: true,
  });
  await dialog.getByLabel('Markdown file', { exact: true }).setInputFiles({
    name: 'Reimported rich.md',
    mimeType: 'text/markdown',
    buffer: bytes,
  });
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/notes') &&
      response.request().method() === 'POST',
  );
  await dialog
    .getByRole('button', { name: 'Import note', exact: true })
    .click();
  const copy = noteDetailSchema.parse(await (await created).json());
  notes.track(copy.id);
  await expect(
    page.getByRole('heading', { name: 'Reimported rich', exact: true }),
  ).toBeVisible();
  await expect(
    body.getByRole('heading', { name: 'Round trip', exact: true }),
  ).toBeVisible();
  await expect(body.locator('strong')).toHaveText('Bold');
  await expect(body.locator('code')).toHaveText('literal <script>');
  await expect(body.getByRole('checkbox')).toHaveCount(1);
  await expect(body.locator(':scope > p').last()).toHaveText(
    'Last paragraph. Edited before export.',
  );
  const saved = await notes.read(copy.id);
  expect(saved.content).toBe((await notes.read(original.id)).content);
  expect(saved.content).toContain(diagram);
});
