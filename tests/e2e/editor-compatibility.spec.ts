import { expect, test } from './note-fixtures.js';

test('large Markdown uses a keyboard-accessible source editor and keeps literal markup', async ({
  page,
  notes,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const source =
    '<img src=x onerror=alert(1)>\r\n[unsafe](javascript:alert%281%29)\r\n' +
    'unbroken-source-'.repeat(8_500);
  const note = await notes.create('Large Folio source', source);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Open note Large Folio source', exact: true })
    .click();
  const region = page.getByRole('region', {
    name: 'Markdown source',
    exact: true,
  });
  const input = region.getByRole('textbox', { name: 'Raw Markdown source' });
  await expect(input).toHaveValue(source.replaceAll('\r\n', '\n'));
  await expect(region.locator('img, script, iframe, a')).toHaveCount(0);
  await input.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await expect(input).toHaveCSS('outline-style', 'solid');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await input.press('Control+End');
  await page.keyboard.insertText('\nEdited in source mode.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toBe(source + '\r\nEdited in source mode.');
});
