/**
 * Admin Alerts E2E Tests
 *
 * Validates:
 * - pit_boss can access /admin/anomaly-detection/alerts
 * - dealer is redirected away from /admin routes
 * - /admin/anomaly-detection/reports loads Measurement Reports
 * - /admin redirects to /admin/anomaly-detection/alerts
 *
 * @see EXEC-040-PRD WS6
 */

import { expect, test } from '@playwright/test';

import {
  ADMIN_URLS,
  createAdminTestScenario,
  type AdminTestScenario,
} from '../fixtures/admin-helpers';
import { authenticateAndNavigate } from '../fixtures/auth';

test.describe('Admin Alerts — Authorized Access', () => {
  let scenario: AdminTestScenario;

  test.beforeAll(async () => {
    scenario = await createAdminTestScenario('pit_boss');
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  test('pit_boss can access /admin/alerts', async ({ page }) => {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      ADMIN_URLS.alerts,
    );

    expect(page.url()).toContain('/admin/anomaly-detection/alerts');
    await expect(
      page.getByRole('heading', { name: 'Alerts', exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('/admin/reports loads Measurement Reports', async ({ page }) => {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/admin/anomaly-detection/reports',
    );

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('/admin redirects to /admin/anomaly-detection/alerts', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      ADMIN_URLS.alerts,
    );

    // Now navigate to /admin which should redirect through to /admin/anomaly-detection/alerts
    await page.goto(ADMIN_URLS.index, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForURL('**/admin/anomaly-detection/alerts**', {
      timeout: 30_000,
    });
    expect(page.url()).toContain('/admin/anomaly-detection/alerts');
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
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/shift-dashboard',
    );

    // Navigate to admin route — server redirect sends dealer to /shift-dashboard.
    // Use 'commit' (not 'networkidle') because the shift dashboard has continuous
    // TanStack Query polling that prevents networkidle from ever resolving.
    await page.goto(ADMIN_URLS.alerts, { waitUntil: 'commit' }).catch(() => {
      // Server redirect can abort the original navigation
    });

    // Wait for redirect to settle at shift-dashboard
    await page.waitForURL('**/shift-dashboard**', { timeout: 30_000 });

    const url = page.url();
    expect(url).not.toContain('/admin');
    expect(url).toContain('/shift-dashboard');
  });
});
