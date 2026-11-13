import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Lexer, type Token, type Tokens } from 'marked';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './note-fixtures.js';

const files = execFileSync('git', ['ls-files', '-z', '*.md'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

async function openNote(page: Page, title: string) {
  await page.goto('/');
  await page
    .getByRole('button', { name: `Open note ${title}`, exact: true })
    .click();
  const body = page.getByRole('textbox', { name: 'Note content', exact: true });
  await expect(body).toBeVisible({ timeout: 15_000 });
  return body;
}

async function paste(body: Locator, data: Record<string, string>) {
  await body.evaluate((editor, data) => {
    const clipboardData = new DataTransfer();
    for (const [type, source] of Object.entries(data))
      clipboardData.setData(type, source);
    editor.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, data);
}

for (const file of files) {
  test(`renders and saves ${file} in the editor`, async ({ page, notes }) => {
    test.setTimeout(60_000);
    const source = await readFile(file, 'utf8');
    const title = `Render ${file.replaceAll('/', ' › ')}`;
    const note = await notes.create(title, source);
    const body = await openNote(page, title);
    const tokens = Lexer.lex(source, { gfm: true });
    const headings = tokens.filter(
      (token): token is Tokens.Heading => token.type === 'heading',
    );
    const tables = tokens.filter(
      (token): token is Tokens.Table => token.type === 'table',
    );
    const codes = tokens.filter(
      (token): token is Tokens.Code => token.type === 'code',
    );
    let tasks = 0;
    function countTasks(token: Token) {
      if (token.type === 'list_item' && token.task) tasks++;
      const children: Token[] =
        token.type === 'list'
          ? token.items
          : 'tokens' in token
            ? (token.tokens ?? [])
            : [];
      children.forEach(countTasks);
    }
    tokens.forEach(countTasks);
    await expect(body.getByRole('heading')).toHaveCount(headings.length);
    await expect(body.locator('table')).toHaveCount(tables.length);
    await expect(body.locator('pre > code')).toHaveCount(
      codes.filter(({ lang }) => lang !== 'mermaid').length,
    );
    await expect(body.getByRole('checkbox')).toHaveCount(tasks);
    for (const [index, table] of tables.entries()) {
      const rendered = body.locator('table').nth(index);
      await expect(rendered.getByRole('columnheader')).toHaveCount(
        table.header.length,
      );
      await expect(rendered.getByRole('row')).toHaveCount(
        table.rows.length + 1,
      );
    }
    for (const [index, code] of codes
      .filter(({ lang }) => lang !== 'mermaid')
      .entries())
      expect(await body.locator('pre > code').nth(index).textContent()).toBe(
        code.text,
      );
    const diagrams = codes.filter(({ lang }) => lang === 'mermaid');
    const previews = body
      .getByRole('img', { name: 'Mermaid diagram preview' })
      .locator('svg');
    await expect(previews).toHaveCount(diagrams.length, { timeout: 15_000 });
    if (file === 'roadmaps/editor-ui-redesign.md') {
      await expect(body.locator('td br')).toHaveCount(12);
      const images = body.locator('img.markdown-image');
      await expect(images).toHaveCount(2);
      for (const image of await images.all())
        await expect
          .poll(() =>
            image.evaluate((element: HTMLImageElement) => element.naturalWidth),
          )
          .toBeGreaterThan(0);
    }
    if (file === 'roadmaps/initial-project.md')
      await expect(body.locator('[data-markdown-anchor="t01"]')).toHaveCount(1);
    expect((await notes.read(note.id)).content).toBe(source);

    await body.locator(':scope > h1').first().click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' edited');
    await expect.poll(async () => (await notes.read(note.id)).revision).toBe(2);
    await openNote(page, title);
    await expect(body.locator(':scope > h1').first()).toContainText('edited');
    await expect(body.locator('table')).toHaveCount(tables.length);
    await expect(body.getByRole('checkbox')).toHaveCount(tasks);
  });
}

test('pastes a rich document, edits a table cell and reopens it on a narrow screen', async ({
  page,
  notes,
}) => {
  const source = [
    '# Markdown clipboard',
    '**Bold**, *italic*, ~~strike~~, `inline` and [details](#details).',
    '3. Numbered\n   - Nested',
    '- [x] Complete\n  - [ ] Pending',
    '> Quoted\n>\n> > Nested quote',
    'Above\n\n---\n\nBelow',
    '<a id="details"></a>',
    '| Kind | Value | More |\n| :--- | :---: | ---: |\n| **Table**<br>line two | `x\\|y` | a \\| b |',
    '```html\n<script>literal</script>\n```',
    '```mermaid\nflowchart LR\n  A --> B\n```',
    '![Remote reference](https://example.invalid/figure.png)',
  ]
    .join('\r\n\r\n')
    .replace(/(?<!\r)\n/g, '\r\n');
  const title = 'Markdown clipboard fixture';
  const note = await notes.create(title, '');
  await page.setViewportSize({ width: 375, height: 820 });
  const body = await openNote(page, title);
  const remote: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://')) remote.push(request.url());
  });
  await body.focus();
  await paste(body, { 'text/plain': source });
  await expect(
    body.getByRole('heading', { name: 'Markdown clipboard' }),
  ).toBeVisible();
  await expect(body.locator('ol')).toHaveAttribute('start', '3');
  await expect(body.getByRole('checkbox')).toHaveCount(2);
  await expect(body.locator('blockquote blockquote')).toHaveText(
    'Nested quote',
  );
  await expect(body.locator('hr')).toHaveCount(1);
  await expect(body.locator('pre > code')).toHaveText(
    '<script>literal</script>',
  );
  await expect(
    body.getByRole('img', { name: 'Remote reference' }),
  ).toBeVisible();
  await expect(
    body.getByRole('img', { name: 'Mermaid diagram preview' }).locator('svg'),
  ).toBeVisible();
  expect(remote).toEqual([]);
  const table = body.getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Value' })).toHaveCSS(
    'text-align',
    'center',
  );
  await expect(table.locator('td code')).toHaveText('x|y');
  await expect(table.locator('td br')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toContain('flowchart LR\r\n  A --> B');
  await body.getByRole('link', { name: 'details' }).click();
  await expect
    .poll(() =>
      body.evaluate(
        () =>
          window.getSelection()?.anchorNode?.parentElement?.closest('th')
            ?.textContent,
      ),
    )
    .toBe('Kind');
  await table.locator('td').last().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' edited');
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toContain('a \\| b edited');
  await openNote(page, title);
  await expect(table.locator('td').last()).toHaveText('a | b edited');
});

test('uses Markdown from source-editor clipboard metadata and supports undo', async ({
  page,
  notes,
}) => {
  const title = 'Source editor clipboard';
  await notes.create(title, '');
  const body = await openNote(page, title);
  await body.focus();
  await paste(body, {
    'text/plain': '# Source editor\n\n**A bold paragraph**',
    'text/html': '<div># Source editor</div><div>**A bold paragraph**</div>',
    'vscode-editor-data': '{"mode":"markdown"}',
  });
  await expect(
    body.getByRole('heading', { name: 'Source editor' }),
  ).toBeVisible();
  await expect(body.locator('strong')).toHaveText('A bold paragraph');
  await body.press('Control+z');
  await expect(body.getByRole('heading')).toHaveCount(0);
  await expect(body.locator('p')).toHaveText('');
});
