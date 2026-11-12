import type { Page } from '@playwright/test';

export async function openExplorer(page: Page) {
  const toggle = page.getByRole('button', {
    name: 'Show folders',
    exact: true,
  });
  if (await toggle.count()) await toggle.click();
}

/** Exercise the same disclosure path as a user before invoking an action. */
export async function openActionMenu(page: Page, label: string) {
  if (label === 'Workspace actions') await openExplorer(page);
  const trigger = page.getByRole('button', { name: label, exact: true });
  const disclosure = page.locator('details').filter({ has: trigger });
  if ((await disclosure.getAttribute('open')) === null) await trigger.click();
}
