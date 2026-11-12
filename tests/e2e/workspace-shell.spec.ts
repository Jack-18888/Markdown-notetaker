import { expect, test } from './note-fixtures.js';
import { openExplorer } from './workspace-controls.js';

for (const width of [1280, 320]) {
  test(`explorer and action disclosure focus at ${width}px`, async ({
    page,
    notes,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const note = await notes.create(`Shell keyboard ${width}`);
    await page.goto('/');
    const explorer = page.getByRole('complementary', { name: 'Explorer' });
    if (width === 320) await expect(explorer).toBeHidden();
    await openExplorer(page);
    await explorer
      .getByRole('button', { name: 'New note', exact: true })
      .focus();
    await page.keyboard.press('Escape');
    const toggle = page.getByRole('button', {
      name: 'Show folders',
      exact: true,
    });
    await expect(toggle).toBeFocused();
    await expect(explorer).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(
      explorer.getByRole('button', { name: 'Close folders', exact: true }),
    ).toBeFocused();
    await explorer
      .getByRole('button', { name: note.title, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: note.title, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('main')).toBeFocused();
    const menu = page.getByRole('button', {
      name: 'Note actions',
      exact: true,
    });
    await menu.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    const rename = page.getByRole('button', {
      name: 'Rename note',
      exact: true,
    });
    await expect(rename).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page
        .getByRole('dialog', { name: 'Rename note', exact: true })
        .getByLabel('Note title', { exact: true }),
    ).toHaveValue(note.title);
    await page.keyboard.press('Escape');
    await expect(rename).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(rename).toBeHidden();
    expect(await notes.read(note.id)).toEqual(note);
  });
}

test('mobile explorer stays available through a failed note load and closes after retry succeeds', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Failed mobile load');
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route(`**/api/notes/${note.id}`, (route) => route.abort());
  await page.goto('/');
  await openExplorer(page);
  const explorer = page.getByRole('complementary', { name: 'Explorer' });
  await explorer.getByRole('button', { name: note.title, exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry note', exact: true }),
  ).toBeVisible();
  await expect(explorer).toBeVisible();
  await page.unroute(`**/api/notes/${note.id}`);
  await page.getByRole('button', { name: 'Retry note', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: note.title, exact: true }),
  ).toBeVisible();
  await expect(explorer).toBeHidden();
  await expect(page.getByRole('main')).toBeFocused();
});
