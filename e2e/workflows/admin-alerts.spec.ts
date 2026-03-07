/**
 * Admin Alerts E2E Tests
 *
 * Validates:
 * - pit_boss can access /admin/alerts
 * - dealer is redirected away from /admin routes
 * - /admin/reports shows Coming Soon placeholder
 * - /admin redirects to /admin/alerts
 *
 * @see EXEC-040-PRD WS6
 */

import { expect, test } from '@playwright/test';

import {
  ADMIN_URLS,
  authenticateAdmin,
  createAdminTestScenario,
  type AdminTestScenario,
} from '../fixtures/admin-helpers';

test.describe('Admin Alerts — Authorized Access', () => {
  let scenario: AdminTestScenario;

  test.beforeAll(async () => {
    scenario = await createAdminTestScenario('pit_boss');
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('pit_boss can access /admin/alerts', async ({ page }) => {
    await authenticateAdmin(page, scenario.testEmail, scenario.testPassword);
    await page.goto(ADMIN_URLS.alerts, { waitUntil: 'domcontentloaded' });

    expect(page.url()).toContain('/admin/alerts');
    await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('/admin/reports shows Coming Soon', async ({ page }) => {
    await authenticateAdmin(page, scenario.testEmail, scenario.testPassword);
    await page.goto(ADMIN_URLS.reports, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('coming soon', { exact: false })).toBeVisible();
  });

  test('/admin redirects to /admin/alerts', async ({ page }) => {
    await authenticateAdmin(page, scenario.testEmail, scenario.testPassword);
    // Server redirect from /admin → /admin/alerts
    await page.goto(ADMIN_URLS.index, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForURL('**/admin/alerts**', { timeout: 15_000 });
    expect(page.url()).toContain('/admin/alerts');
  });
});

test.describe('Admin Alerts — Unauthorized Access', () => {
  let scenario: AdminTestScenario;

  test.beforeAll(async () => {
    scenario = await createAdminTestScenario('dealer');
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('dealer is redirected from /admin', async ({ page }) => {
    test.setTimeout(60_000);
    await authenticateAdmin(page, scenario.testEmail, scenario.testPassword);

    // Navigate to admin route — server redirect sends dealer to /shift-dashboard.
    // Use 'commit' (not 'networkidle') because the shift dashboard has continuous
    // TanStack Query polling that prevents networkidle from ever resolving.
    await page.goto(ADMIN_URLS.alerts, { waitUntil: 'commit' }).catch(() => {
      // Server redirect can abort the original navigation
    });

    // Wait for redirect to settle at shift-dashboard
    await page.waitForURL('**/shift-dashboard**', { timeout: 15_000 });

    const url = page.url();
    expect(url).not.toContain('/admin/alerts');
    expect(url).toContain('/shift-dashboard');
  });
});
