import { expect, test } from '@playwright/test';

test.describe('boot', () => {
  test('renders editorial-daily masthead on /', async ({ page }) => {
    await page.goto('/');
    // editorial-daily preset is the default — masthead should be visible
    const masthead = page.locator('[data-tile-id="header"]').last();
    await expect(masthead).toBeVisible({ timeout: 10_000 });
    // brand text "The Mirror Daily" rendered
    await expect(page.locator('.brand .lead')).toContainText('The Mirror');
  });
});
