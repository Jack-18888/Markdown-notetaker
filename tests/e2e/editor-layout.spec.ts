import { expect, test } from './note-fixtures.js';
import { openExplorer } from './workspace-controls.js';

for (const width of [1280, 320]) {
  test(`layout changes preserve the draft and undo history at ${width}px`, async ({
    page,
    notes,
  }) => {
    const note = await notes.create(
      `Stable editor ${width}`,
      'Original writing',
    );
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    await page.goto('/');
    await page
      .getByRole('button', { name: `Open note ${note.title}`, exact: true })
      .click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await expect(body).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const writes: string[] = [];
    page.on('request', (request) => {
      if (
        request.url().includes('/api/') &&
        ['POST', 'PATCH', 'DELETE'].includes(request.method())
      )
        writes.push(request.method());
    });
    await body.fill('Keep this draft');
    await openExplorer(page);
    await page
      .getByRole('button', { name: 'Close folders', exact: true })
      .click();
    await page.setViewportSize({
      width: width === 320 ? 1280 : 320,
      height: 900,
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(body).toHaveText('Keep this draft');
    await expect(page.getByRole('banner').getByRole('status')).toHaveText(
      'Unsaved changes',
    );
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(body).toHaveText('Original writing');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(body).toHaveText('Keep this draft');
    expect(writes).toEqual([]);
    expect(await notes.read(note.id)).toEqual(note);
  });
}
