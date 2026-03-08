/**
 * Measurement Reports E2E Test
 *
 * Validates the measurement reports dashboard is accessible
 * and renders all 4 metric widgets.
 *
 * @see EXEC-046 WS5 — E2E Test
 */

import { test, expect } from '@playwright/test';

test.describe('Measurement Reports Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as pit boss (assumes test auth helper or seed data)
    await page.goto('/signin');
    await page.fill(
      '[name="email"]',
      process.env.E2E_PIT_BOSS_EMAIL ?? 'pitboss@test.com',
    );
    await page.fill(
      '[name="password"]',
      process.env.E2E_PIT_BOSS_PASSWORD ?? 'test-password',
    );
    await page.click('button[type="submit"]');
    await page.waitForURL('**/shift-dashboard**');
  });

  test('navigates to /admin/reports and sees 4 widget headings', async ({
    page,
  }) => {
    await page.goto('/admin/reports');

    // Verify page loads
    await expect(page.getByText('Measurement Reports')).toBeVisible();

    // Verify all 4 widget headings are visible
    await expect(page.getByText('Theo Discrepancy')).toBeVisible();
    await expect(page.getByText('Audit Correlation')).toBeVisible();
    await expect(page.getByText('Rating Coverage')).toBeVisible();
    await expect(page.getByText('Loyalty Liability')).toBeVisible();
  });

  test('MEAS-004 shows "As of" freshness badge', async ({ page }) => {
    await page.goto('/admin/reports');

    // MEAS-004 should show periodic freshness badge
    // Either "As of {date}" if data exists, or "No data yet" for new casino
    const loyaltySection = page.locator('text=Loyalty Liability').locator('..');
    await expect(loyaltySection).toBeVisible();

    // Check for either the "As of" badge or "No data yet" state
    const hasAsOf = await page
      .getByText(/As of/)
      .isVisible()
      .catch(() => false);
    const hasNoData = await page
      .getByText('No data yet')
      .isVisible()
      .catch(() => false);

    expect(hasAsOf || hasNoData).toBe(true);
  });
});
