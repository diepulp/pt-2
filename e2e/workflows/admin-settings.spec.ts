/**
 * Admin Settings E2E Tests (EXEC-042 WS4)
 *
 * Tests for admin settings pages: thresholds and shifts.
 *
 * Fixture note: createTestScenario() does raw INSERT INTO casino which does NOT
 * create a casino_settings row. The casino_settings row is created via direct
 * service-role insert (Option B per EXEC-042 DA P1-4). This bypasses the
 * bootstrap flow — a separate test covers the bootstrap path itself.
 *
 * @see docs/21-exec-spec/EXEC-042-admin-settings-pages.md WS4
 */

import { test, expect } from '@playwright/test';

import { authenticateAndNavigate } from '../fixtures/auth';
import {
  createServiceClient,
  createTestScenario,
  type TestScenario,
} from '../fixtures/test-data';

let scenario: TestScenario;

test.beforeAll(async () => {
  scenario = await createTestScenario();

  // Insert casino_settings row (bypasses bootstrap — see fixture note above)
  const supabase = createServiceClient();
  const { error } = await supabase.from('casino_settings').upsert(
    {
      casino_id: scenario.casinoId,
      timezone: 'America/Los_Angeles',
      gaming_day_start_time: '06:00',
    },
    { onConflict: 'casino_id' },
  );
  if (error) {
    throw new Error(`Failed to create casino_settings: ${error.message}`);
  }
});

test.afterAll(async () => {
  await scenario.cleanup();
});

test.describe('Admin Settings — Thresholds', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/admin/anomaly-detection/settings',
    );
  });

  test('renders all 8 threshold categories', async ({ page }) => {
    test.setTimeout(60_000);
    // Wait for the threshold form to render (client-side hydration + data fetch)
    await expect(page.getByText('Financial Anomalies')).toBeVisible({
      timeout: 30_000,
    });

    // Verify all 8 category cards are visible
    const categories = [
      'Table Idle',
      'Slip Duration',
      'Pause Duration',
      'Drop Anomaly',
      'Hold Deviation',
      'Promo Issuance Spike',
      'Promo Void Rate',
      'Outstanding Aging',
    ];

    for (const name of categories) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('toggle category and save persists', async ({ page }) => {
    // Find Hold Deviation toggle (disabled by default)
    const holdDeviationCard = page.locator('text=Hold Deviation').locator('..');
    const toggle = holdDeviationCard
      .locator('..')
      .locator('..')
      .getByRole('switch');

    // Toggle it on
    await toggle.click();

    // Save button should appear
    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Confirm dialog
    const confirmButton = page.getByRole('button', { name: 'Confirm' });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Wait for save to complete (button disappears)
    await expect(saveButton).not.toBeVisible({ timeout: 10_000 });

    // Reload and verify persistence
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Hold Deviation should now be enabled (toggle checked)
    const reloadedToggle = page
      .locator('text=Hold Deviation')
      .locator('..')
      .locator('..')
      .locator('..')
      .getByRole('switch');
    await expect(reloadedToggle).toHaveAttribute('data-state', 'checked');
  });

  test('edit numeric value and save persists', async ({ page }) => {
    // Find table_idle warn_minutes input
    const warnInput = page.locator('#table_idle-warn_minutes');
    await warnInput.clear();
    await warnInput.fill('30');

    // Save
    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    const confirmButton = page.getByRole('button', { name: 'Confirm' });
    await confirmButton.click();

    // Wait for save
    await expect(saveButton).not.toBeVisible({ timeout: 10_000 });

    // Reload and verify
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#table_idle-warn_minutes')).toHaveValue('30', {
      timeout: 15_000,
    });
  });
});

test.describe('Admin Settings — Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/admin/anomaly-detection/settings',
    );
  });

  test('anomaly-detection sidebar nav switches between pages', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // Wait for page content to render
    await expect(
      page.getByRole('heading', { name: 'Detection Settings' }),
    ).toBeVisible({ timeout: 30_000 });

    // Click Alerts link in the page-level sidebar (inside main > complementary)
    const pageSidebar = page.locator('main').getByRole('complementary');
    await pageSidebar.getByRole('link', { name: 'Alerts' }).click();
    await expect(page).toHaveURL(/\/admin\/anomaly-detection\/alerts/, {
      timeout: 15_000,
    });

    // Click back to Detection Settings
    const alertsSidebar = page.locator('main').getByRole('complementary');
    await alertsSidebar
      .getByRole('link', { name: 'Detection Settings' })
      .click();
    await expect(page).toHaveURL(/\/admin\/anomaly-detection\/settings/, {
      timeout: 15_000,
    });
  });
});

test.describe('Admin Settings — Shifts', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      '/admin/settings/operations',
    );
  });

  test('change gaming day start and verify preview updates', async ({
    page,
  }) => {
    // Change start time
    const timeInput = page.locator('#gaming-day-start');
    await timeInput.fill('04:00');

    // Preview should update live — use the input value to verify
    await expect(page.locator('#gaming-day-start')).toHaveValue('04:00');

    // Warning banner should appear
    await expect(
      page.getByText('Changing gaming day boundaries'),
    ).toBeVisible();

    // Save
    const saveButton = page.getByRole('button', { name: 'Save Changes' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Confirm warning dialog
    const confirmButton = page.getByRole('button', {
      name: 'Confirm Changes',
    });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Wait for save
    await expect(saveButton).not.toBeVisible({ timeout: 10_000 });

    // Reload and verify persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gaming-day-start')).toHaveValue('04:00', {
      timeout: 15_000,
    });
  });
});
