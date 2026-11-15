import { readFile } from 'node:fs/promises';
import { expect, test } from './note-fixtures.js';
import { openActionDisclosure } from './workspace-controls.js';

const fence = '\x60'.repeat(3);
const diagram = 'flowchart LR\r\n  A --> B  \r\n';
const sample = [
  '# Welcome to Folio',
  '',
  'Folio is a distraction-free workspace that blends **fluid block editing** with clean, portable ' +
    '\x60Markdown\x60' +
    '. Every block you write here serializes cleanly to standard GitHub-Flavored Markdown—switch between **Editor** and **Markdown** in the top bar at any time.',
  '',
  '> [!TIP]',
  '> **Quick tip:** Type ' +
    '\x60/\x60' +
    ' on any empty line to open the slash command palette, or highlight any text to reveal the floating formatting toolbar.',
  '',
  '## Core Editing Mechanics',
  '',
  '- [x] Type \x60# \x60, \x60## \x60, or \x60### \x60 for instant headings',
  '- [x] Use \x60- \x60, \x601. \x60, or \x60[] \x60 to start lists and checklists',
  '- [ ] Hover any block and drag the **6-dot handle** to reorder paragraphs or sections',
  '- [ ] Export this page as a \x60.md\x60 file or print cleanly to PDF from the top-right menu',
  '',
  '## Keyboard & Markdown Shortcuts',
  '',
  '| Trigger | Block Type | Keyboard / Action |',
  '| --- | --- | --- |',
  '| \x60/\x60 | Slash Command Menu | Arrow keys + Enter to insert |',
  '| \x60# \x60 / \x60## \x60 | Heading 1 / Heading 2 | Space after hashes |',
  '| \x60[] \x60 | To-Do Checklist | Click checkbox or Space |',
  '| ' +
    '\x60'.repeat(4) +
    ' ' +
    fence +
    ' ' +
    '\x60'.repeat(4) +
    ' | Code Block | Syntax highlighting + Copy |',
  '| ' + '\x60> \x60' + ' | Blockquote | Editorial pull quote |',
  '| \x60---\x60 | Horizontal Divider | Clean section break |',
  '',
  '<details>',
  '<summary>How bidirectional Markdown sync works</summary>',
  '',
  'hbdvhjqnqj',
  '</details>',
  '',
  '### Syntax-Highlighted Code Example',
  '',
  fence + 'typescript',
  'interface DocumentSnapshot {',
  '  id: string;',
  '  title: string;',
  '  updatedAt: number;',
  '}',
  '',
  'export function formatSlug(title: string): string {',
  '  return title',
  '    .toLowerCase()',
  '    .replace(/[^a-z0-9]+/g, "-")',
  '    .replace(/(^-|-$)/g, "") || "untitled";',
  '}',
  fence,
  '',
  '> Writing tools should disappear behind your thoughts—structured enough to organize complex specs, quiet enough for long-form prose.',
].join('\n');

test('saves the Folio example in Markdown, edits its rich blocks and exports the reopened note', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Folio example fixture', '');
  await page.goto('/');
  const open = page.getByRole('button', {
    name: 'Open note Folio example fixture',
    exact: true,
  });
  await open.click();
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'Raw Markdown source' });
  await source.fill(sample);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toBe(sample);

  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Heading 1', exact: true }),
  ).toHaveText('Welcome to Folio');
  await expect(
    page.getByRole('complementary', { name: 'TIP alert' }),
  ).toContainText('Quick tip');
  await page.getByRole('checkbox', { name: /drag the 6-dot handle/i }).check();
  const table = page.getByRole('region', { name: 'Markdown table' });
  await expect(table.getByText(fence, { exact: true })).toBeVisible();
  await table
    .getByRole('textbox', { name: 'Row 5, column 3', exact: true })
    .fill('Highlighting and copy');
  await page
    .getByText('How bidirectional Markdown sync works', { exact: true })
    .click();
  await page
    .getByText('hbdvhjqnqj', { exact: true })
    .fill('The toggle body is editable.');
  const code = page.getByRole('region', { name: 'Code block' });
  await expect(code.locator('.tok-keyword').first()).toBeVisible();
  await code.getByRole('button', { name: 'Edit code' }).click();
  await code.getByRole('textbox', { name: 'Code source' }).press('Control+End');
  await code.getByRole('textbox', { name: 'Code source' }).press('End');
  await code.getByRole('textbox', { name: 'Code source' }).press('Enter');
  await page.keyboard.insertText('// Retained code edit');

  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(source).toHaveValue(/The toggle body is editable\./);
  await expect(source).toHaveValue(/\/\/ Retained code edit/);
  await source.press('Control+z');
  await expect(source).not.toHaveValue(/\/\/ Retained code edit/);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(source).toHaveValue(/\/\/ Retained code edit/);
  await openActionDisclosure(page, 'Note actions');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const exported = await readFile((await (await downloaded).path())!, 'utf8');
  const saved = await notes.read(note.id);
  expect(saved.title).toBe('Folio example fixture');
  expect(saved.content).toBe(exported);
  expect(exported).toContain('# Welcome to Folio');
  expect(exported).toContain('> [!TIP]\n> **Quick tip:**');
  expect(exported).toContain(
    '- [x] Hover any block and drag the **6-dot handle**',
  );
  expect(exported).toContain('Highlighting and copy');
  await page.reload();
  await open.click();
  await expect(
    page.getByRole('checkbox', { name: /drag the 6-dot handle/i }),
  ).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Heading 1' })).toHaveText(
    'Welcome to Folio',
  );
});

test('edits linked footnotes and definitions while preserving literal HTML and exact Mermaid bytes', async ({
  page,
  notes,
}) => {
  const hostile = '<img src=https://example.invalid/unsafe onerror="alert(1)">';
  const source =
    'Keep [reference][ref], and see footnote[^tip].\r\n\r\n' +
    '[ref]: https://example.com "Example"\r\n\r\n[^tip]: Footnote definition.\r\n\r\n' +
    hostile +
    '\r\n\r\n' +
    fence +
    'mermaid\n' +
    diagram +
    '\n' +
    fence;
  const note = await notes.create('Folio reference fixture', source);
  const external: string[] = [];
  page.on('request', (request) => {
    if (/^https:/.test(request.url())) external.push(request.url());
  });
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Open note Folio reference fixture',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Literal Markdown')).toHaveText(hostile);
  await expect(
    page.getByRole('img', { name: 'Mermaid diagram preview' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Footnote definition label' })
    .fill('updated');
  await page
    .getByRole('textbox', { name: 'Footnote definition label' })
    .press('Enter');
  await page
    .getByRole('textbox', { name: 'Reference URL' })
    .fill('https://example.org/new');
  await page.getByRole('textbox', { name: 'Reference URL' }).press('Enter');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toContain('[^updated]: Footnote definition.');
  const saved = (await notes.read(note.id)).content;
  expect(saved).toContain('see footnote[^updated].');
  expect(saved).toContain('[ref]: https://example.org/new "Example"');
  expect(saved).toContain(hostile + '\r\n\r\n');
  expect(saved).toContain(diagram);
  expect(external).toEqual([]);
});

test('loads images on request and prints the current draft from either view', async ({
  page,
  notes,
}) => {
  const imageUrl = 'https://example.invalid/folio.svg';
  await notes.create(
    'Folio print fixture',
    'Original text.\n\n![Fixture image](' + imageUrl + ')',
  );
  let requests = 0;
  await page.route(imageUrl, async (route) => {
    requests++;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>',
    });
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Folio print fixture', exact: true })
    .click();
  const loadImage = page.getByRole('button', {
    name: /Load image.*Fixture image/,
  });
  await expect(loadImage).toBeVisible();
  expect(requests).toBe(0);
  await loadImage.click();
  await expect(page.getByRole('img', { name: 'Fixture image' })).toBeVisible();
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printedFolio =
        document.querySelector('.folio-print-view')?.textContent ?? '';
    };
  });
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-printed-folio',
    /Original text/,
  );
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Raw Markdown source' })
    .fill('**Draft for printing.**');
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-printed-folio',
    /Draft for printing/,
  );
});
