import { expect, test } from './note-fixtures.js';
import { noteTitleButton } from './workspace-controls.js';

const markdown = [
  '# A quieter place to write',
  'The writing canvas keeps project notes, [links](https://example.com), and code together. Useful controls appear as the work calls for them.',
  '## Release checklist',
  '- [x] Review the writing layout\n- [ ] Confirm the release notes',
  'A circle covers an area of $\\pi r^2$.',
  '| Workspace | Editing | Diagrams | Navigation | Export | Accessibility |\n| --- | --- | --- | --- | --- | --- |\n| Ready | Review | Review | Ready | Ready | Review |',
  '```js\nconst release = { review: "sidebar", accessibility: "keyboard controls", diagram: "local render" };\n```',
  '```mermaid\nflowchart LR\n Draft[Write a draft] --> Review[Review the source] --> Save[Save the project notes] --> Export[Export the Markdown file]\n```',
].join('\n\n');

for (const width of [1440, 320]) {
  test(`the writing layout contains rich content at ${width}px`, async ({
    page,
    notes,
  }) => {
    const note = await notes.create(`Release notebook ${width}`, markdown);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: `Open note ${note.title}` }).click();
    const main = page.getByRole('main');
    const title = main.getByRole('heading', { name: note.title, exact: true });
    const body = main.getByRole('group', { name: 'Note content', exact: true });
    const heading = body.getByRole('heading', {
      name: 'A quieter place to write',
    });
    const sidebar = page.getByRole('navigation', { name: 'Workspace folders' });
    const diagram = body.getByRole('img', { name: 'Mermaid diagram preview' });
    await expect(diagram.locator('svg')).toBeVisible({ timeout: 15_000 });
    await expect(body.locator('.katex')).toBeVisible();
    await expect(sidebar).toHaveCount(width === 320 ? 0 : 1);
    if (width === 1440) {
      await expect(
        sidebar.getByRole('button', { name: note.title }),
      ).toHaveAttribute('aria-current', 'page');
    }
    const mainBox = (await main.boundingBox())!;
    const headingBox = (await heading.boundingBox())!;
    expect(
      Math.abs((await title.boundingBox())!.x - headingBox.x),
    ).toBeLessThan(1);
    if (width === 1440) {
      expect(headingBox.width).toBeCloseTo(760, 0);
      expect(
        Math.abs(
          mainBox.x + mainBox.width / 2 - headingBox.x - headingBox.width / 2,
        ),
      ).toBeLessThan(12);
    } else {
      for (const block of [
        body.locator('.folio-table-frame'),
        body.locator('.folio-code pre'),
        diagram,
      ]) {
        const sizes = await block.evaluate((el) => ({
          visible: el.clientWidth,
          scrollable: el.scrollWidth,
        }));
        expect(
          sizes.scrollable,
          `${block} scrolls within the canvas`,
        ).toBeGreaterThan(sizes.visible);
      }
    }
    expect(await main.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
      await main.evaluate((el) => el.clientWidth),
    );
    await page.screenshot({ path: `test-results/writing-layout-${width}.png` });
    if (width === 320) {
      await diagram.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/writing-layout-${width}-blocks.png`,
      });
    }
    expect(await notes.read(note.id)).toEqual(note);
  });
}

test('disclosures and the sidebar keep the active editor and undo history', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Layout history', 'Original paragraph');
  await page.goto('/');
  await page.getByRole('button', { name: `Open note ${note.title}` }).click();
  const body = page.getByRole('group', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  const root = page
    .getByRole('navigation', { name: 'Workspace folders' })
    .getByRole('button', { name: 'Workspace', exact: true });
  const workspaceActions = page.getByRole('button', {
    name: 'Workspace actions',
    exact: true,
  });
  const rootY = (await root.boundingBox())!.y;
  await workspaceActions.press('Enter');
  await expect(
    page.getByRole('button', { name: 'New folder', exact: true }),
  ).toBeVisible();
  expect((await root.boundingBox())!.y).toBe(rootY);
  await page.screenshot({ path: 'test-results/workspace-actions-popup.png' });
  await page.keyboard.press('Escape');
  await expect(workspaceActions).toBeFocused();
  await body.locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' with a draft');
  const disclosure = page.getByRole('button', {
    name: 'Note actions',
    exact: true,
  });
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Rename note', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(disclosure).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Rename note', exact: true }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Hide folders', exact: true }).click();
  const sidebarToggle = page.getByRole('button', {
    name: 'Show folders',
    exact: true,
  });
  await sidebarToggle.click();
  await expect(
    page
      .getByRole('navigation', { name: 'Workspace folders' })
      .getByRole('button', { name: 'Workspace', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sidebarToggle).toBeFocused();
  const paragraph = body.getByRole('textbox', {
    name: 'Paragraph',
    exact: true,
  });
  await expect(paragraph).toHaveText('Original paragraph with a draft');
  await paragraph.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraph).toHaveText('Original paragraph');
});

test('a long title wraps and autosaves after returning to the body at 320px', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Narrow title', 'Body text');
  const newTitle =
    'A longer title that wraps across several lines in the writing column';
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page
    .getByRole('button', { name: `Open note ${note.title}`, exact: true })
    .click();
  const body = page.getByRole('group', { name: 'Note content', exact: true });
  await expect(body).toBeVisible();
  await noteTitleButton(page, note.title).click();
  const title = page.getByRole('textbox', { name: 'Note title', exact: true });
  const initialHeight = (await title.boundingBox())!.height;
  await title.fill(newTitle);
  const editingHeight = (await title.boundingBox())!.height;
  expect(editingHeight).toBeGreaterThan(initialHeight);
  await page.screenshot({ path: 'test-results/inline-title-320.png' });
  await title.press('Tab');
  await expect(
    body.getByRole('button', { name: 'Add block below', exact: true }),
  ).toBeFocused();
  const resting = noteTitleButton(page, newTitle);
  await expect(resting).toBeVisible();
  expect((await resting.boundingBox())!.height).toBeCloseTo(editingHeight, 0);
  await expect
    .poll(async () => (await notes.read(note.id)).title)
    .toBe(newTitle);
});
