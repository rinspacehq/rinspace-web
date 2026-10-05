import { expect, test } from '@playwright/test';

test('serves the Rinspace shell at the configured subpath', async ({ page }) => {
  await page.goto('/rinspace/');
  await expect(page.locator('#root')).toBeAttached();
  await expect(page).toHaveTitle(/芥子环|Rinspace/);
});
