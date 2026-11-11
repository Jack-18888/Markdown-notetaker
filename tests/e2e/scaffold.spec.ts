import { expect, test } from '@playwright/test';

test('opens the workspace and loads metadata through the Vite proxy', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workspace');
  await expect(page.getByRole('status')).toHaveText('Local workspace ready');
});
