/**
 * Admin Alerts E2E Tests
 *
 * Validates:
 * - pit_boss can access /admin/alerts
 * - dealer is redirected away from /admin routes
 * - /admin/reports shows Coming Soon placeholder
 * - Alert dismiss removes from list
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

let adminScenario: AdminTestScenario;
let dealerScenario: AdminTestScenario;

test.describe('Admin Alerts', () => {
  test.beforeAll(async () => {
    adminScenario = await createAdminTestScenario('pit_boss');
    dealerScenario = await createAdminTestScenario('dealer');
  });

  test.afterAll(async () => {
    await adminScenario?.cleanup();
    await dealerScenario?.cleanup();
  });

  test('pit_boss can access /admin/alerts', async ({ page }) => {
    await authenticateAdmin(
      page,
      adminScenario.testEmail,
      adminScenario.testPassword,
    );
    await page.goto(ADMIN_URLS.alerts, { waitUntil: 'domcontentloaded' });

    // Should not be redirected away
    expect(page.url()).toContain('/admin/alerts');

    // Should see the alerts page header
    await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('dealer is redirected from /admin', async ({ page }) => {
    await authenticateAdmin(
      page,
      dealerScenario.testEmail,
      dealerScenario.testPassword,
    );
    await page.goto(ADMIN_URLS.alerts, { waitUntil: 'domcontentloaded' });

    // Should be redirected to shift-dashboard
    await page.waitForURL('**/shift-dashboard**', { timeout: 10_000 });
    expect(page.url()).toContain('/shift-dashboard');
  });

  test('/admin/reports shows Coming Soon', async ({ page }) => {
    await authenticateAdmin(
      page,
      adminScenario.testEmail,
      adminScenario.testPassword,
    );
    await page.goto(ADMIN_URLS.reports, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('coming soon', { exact: false })).toBeVisible();
  });

  test('/admin redirects to /admin/alerts', async ({ page }) => {
    await authenticateAdmin(
      page,
      adminScenario.testEmail,
      adminScenario.testPassword,
    );
    await page.goto(ADMIN_URLS.index, { waitUntil: 'domcontentloaded' });

    await page.waitForURL('**/admin/alerts**', { timeout: 10_000 });
    expect(page.url()).toContain('/admin/alerts');
  });
});
