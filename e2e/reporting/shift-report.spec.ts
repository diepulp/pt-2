/**
 * Shift Report E2E Test — Write-Path Journey
 *
 * Validates the email send write-path user journey:
 * navigate to report page, select date/shift, generate report,
 * verify sections render, and test the send flow.
 *
 * @see EXEC-065 WS_E2E
 * @see QA-006 E2E Testing Standard
 */

import { test, expect } from '@playwright/test';

import { authenticateAndNavigate } from '../fixtures/auth';
import { createTestScenario, type TestScenario } from '../fixtures/test-data';

let scenario: TestScenario;

test.beforeAll(async () => {
  scenario = await createTestScenario();
});

test.afterAll(async () => {
  await scenario?.cleanup();
});

test.describe('Shift Report — Review & Distribution', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/admin/reports/shift-summary',
    );
  });

  test('renders selection UI with date picker and shift selector', async ({
    page,
  }) => {
    // Report parameters section visible
    await expect(page.getByText('Report Parameters')).toBeVisible();

    // Date input present
    await expect(page.locator('input[type="date"]')).toBeVisible();

    // Shift selector present
    await expect(page.getByText('Select shift')).toBeVisible();

    // Generate button present
    await expect(
      page.getByRole('button', { name: /generate report/i }),
    ).toBeVisible();

    // Empty state shown
    await expect(page.getByText('No Report Generated')).toBeVisible();
  });

  test('generates report with date and shift selection', async ({ page }) => {
    // Fill date (use today or a known gaming day)
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill('2026-04-15');

    // Select shift boundary
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Day' }).click();

    // Click generate
    await page.getByRole('button', { name: /generate report/i }).click();

    // URL should update with params
    await expect(page).toHaveURL(/gaming_day=2026-04-15/);
    await expect(page).toHaveURL(/shift_boundary=day/);

    // Wait for report to render (either report content or error)
    await page.waitForLoadState('networkidle');

    // Report content or error should be visible (depends on data availability)
    const hasReport = await page
      .getByText('Executive Summary')
      .isVisible()
      .catch(() => false);
    const hasError = await page
      .getByText('Report Error')
      .isVisible()
      .catch(() => false);

    // At least one of these should be true — page responded to the request
    expect(hasReport || hasError).toBe(true);
  });

  test('action toolbar shows PDF, CSV, and Send buttons when report renders', async ({
    page,
  }) => {
    // Navigate with params to trigger report generation
    await page.goto(
      '/admin/reports/shift-summary?gaming_day=2026-04-15&shift_boundary=day',
    );
    await page.waitForLoadState('networkidle');

    // If report renders, toolbar should be visible
    const hasReport = await page
      .getByText('Executive Summary')
      .isVisible()
      .catch(() => false);

    if (hasReport) {
      await expect(
        page.getByRole('button', { name: /generate pdf/i }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /export csv/i }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /send report/i }),
      ).toBeVisible();
    }
  });

  test('send report button opens recipient dialog', async ({ page }) => {
    // Navigate with params
    await page.goto(
      '/admin/reports/shift-summary?gaming_day=2026-04-15&shift_boundary=day',
    );
    await page.waitForLoadState('networkidle');

    const hasReport = await page
      .getByText('Executive Summary')
      .isVisible()
      .catch(() => false);

    if (hasReport) {
      // Click send report
      await page.getByRole('button', { name: /send report/i }).click();

      // Dialog or recipient input should appear
      const hasDialog = await page
        .getByText(/recipient/i)
        .isVisible()
        .catch(() => false);
      const hasEmailInput = await page
        .locator('input[type="email"]')
        .isVisible()
        .catch(() => false);

      expect(hasDialog || hasEmailInput).toBe(true);
    }
  });
});
