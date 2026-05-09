import { expect, test } from '@playwright/test';

test('editorial-daily preset renders all sections in demo mode', async ({ page }) => {
  await page.goto('/?preset=editorial-daily');

  // masthead — scope to header tile so toast text "editorial-daily" can't bleed in.
  // Grid's wrapper + BaseTile's <section> both carry data-tile-id; .first()
  // picks a single root that still contains the inner brand/kicker DOM.
  const header = page.locator('[data-tile-id="header"]').first();
  await expect(header.locator('.brand .lead')).toHaveText('The Mirror');
  await expect(header.locator('.brand .tail')).toHaveText('Daily');

  // sections — section host wraps each, find by data-tile-id.
  // Both Grid's grid-cell wrapper and BaseTile's <section> carry the
  // same data-tile-id, so use .first() to pick a single match.
  await expect(page.locator('[data-tile-id="section-2"]').first()).toBeVisible();
  await expect(page.locator('[data-tile-id="section-3"]').first()).toBeVisible();
  await expect(page.locator('[data-tile-id="section-4"]').first()).toBeVisible();

  // edition kicker is one of the four phase labels (Sanskrit OR English)
  const kicker = header.locator('.kicker .flip').first();
  await expect(kicker).toContainText(/(Prātaḥ|Madhyāhna|Sandhyā|Rātri|Morning|Midday|Evening|Late) Edition/);
});
