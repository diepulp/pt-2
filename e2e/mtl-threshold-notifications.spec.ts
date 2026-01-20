/**
 * MTL Threshold Notifications E2E Tests
 *
 * End-to-end tests for threshold notification workflow and CTR banner display.
 * Tests the complete workflow from buy-in entry to MTL creation and compliance alerts.
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS10
 * @see PRD-MTL-UI-GAPS - MTL UI Implementation Gap Closure
 */

import { test, expect, type Page } from '@playwright/test';

import {
  createMtlTestScenario,
  createTestMtlEntry,
  getPatronDailyTotal,
  getMtlEntriesForPatron,
  type MtlTestScenario,
} from './fixtures/mtl-fixtures';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Authenticate user via browser
 */
async function authenticateUser(page: Page, scenario: MtlTestScenario) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', scenario.testEmail);
  await page.fill('input[name="password"]', scenario.testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(pit|dashboard)/, { timeout: 10000 });
}

/**
 * Open rating slip modal for test scenario
 */
async function openRatingSlipModal(page: Page, scenario: MtlTestScenario) {
  await page.goto('/pit');
  await page.waitForSelector('[data-testid="table-grid"]', { timeout: 10000 });

  // Find and click the occupied seat
  const seat = page.locator(`[data-seat-number="${scenario.seatNumber}"]`);
  await expect(seat).toBeVisible({ timeout: 5000 });
  await seat.click();

  // Wait for modal to open
  const modal = page.locator('[role="dialog"]');
  await expect(modal).toBeVisible({ timeout: 5000 });

  return modal;
}

/**
 * Enter buy-in amount in modal
 */
async function enterBuyInAmount(page: Page, amount: number) {
  const buyInInput = page.locator('[data-testid="new-buyin-input"]');
  await buyInInput.fill(amount.toString());
}

// ============================================================================
// Threshold Notification Tests
// ============================================================================

test.describe('MTL Threshold Notifications (PRD-MTL-UI-GAPS)', () => {
  let scenario: MtlTestScenario;

  test.beforeAll(async () => {
    scenario = await createMtlTestScenario();
  });

  test.afterAll(async () => {
    if (scenario) {
      await scenario.cleanup();
    }
  });

  /**
   * Test 1: Warning toast at $2,500 buy-in
   *
   * Scenario: Enter buy-in that brings daily total to $2,500+
   * Expected: Warning toast "Approaching watchlist threshold" appears
   */
  test('warning toast appears when buy-in brings total to $2,500+', async ({
    page,
  }) => {
    // Create fresh scenario for this test
    const testScenario = await createMtlTestScenario();

    try {
      // Pre-populate some transactions to bring close to threshold
      await createTestMtlEntry(testScenario, 2000, 'in', 'buy_in');

      // Authenticate
      await authenticateUser(page, testScenario);

      // Open modal
      const modal = await openRatingSlipModal(page, testScenario);

      // Enter buy-in that crosses $2,500 threshold (2000 + 600 = 2600)
      await enterBuyInAmount(page, 600);

      // Click Save Changes
      const saveButton = modal.locator('button:has-text("Save Changes")');
      await saveButton.click();

      // Verify warning toast appears
      const toast = page.locator('text="Approaching watchlist threshold"');
      await expect(toast).toBeVisible({ timeout: 5000 });
    } finally {
      await testScenario.cleanup();
    }
  });

  /**
   * Test 2: MTL created toast at $3,000 buy-in
   *
   * Scenario: Enter buy-in that brings total to $3,000+
   * Expected: Info toast "Watchlist threshold met" appears, MTL auto-created
   */
  test('watchlist toast and MTL created when buy-in brings total to $3,000+', async ({
    page,
  }) => {
    const testScenario = await createMtlTestScenario();

    try {
      // Pre-populate to bring close to watchlist threshold
      await createTestMtlEntry(testScenario, 2500, 'in', 'buy_in');

      // Authenticate
      await authenticateUser(page, testScenario);

      // Open modal
      const modal = await openRatingSlipModal(page, testScenario);

      // Enter buy-in that crosses $3,000 threshold (2500 + 600 = 3100)
      await enterBuyInAmount(page, 600);

      // Click Save Changes
      const saveButton = modal.locator('button:has-text("Save Changes")');
      await saveButton.click();

      // Verify watchlist toast appears
      const toast = page.locator('text="Watchlist threshold met"');
      await expect(toast).toBeVisible({ timeout: 5000 });

      // Verify MTL entry was auto-created
      const entries = await getMtlEntriesForPatron(testScenario);
      expect(entries.length).toBeGreaterThanOrEqual(2); // Pre-existing + auto-created
    } finally {
      await testScenario.cleanup();
    }
  });

  /**
   * Test 3: CTR warning toast at $9,000+ buy-in
   *
   * Scenario: Enter buy-in that brings total to >$9,000
   * Expected: Warning toast "CTR threshold approaching" appears
   */
  test('CTR approaching toast when buy-in brings total to >$9,000', async ({
    page,
  }) => {
    const testScenario = await createMtlTestScenario();

    try {
      // Pre-populate to bring close to CTR threshold
      await createTestMtlEntry(testScenario, 8500, 'in', 'buy_in');

      // Authenticate
      await authenticateUser(page, testScenario);

      // Open modal
      const modal = await openRatingSlipModal(page, testScenario);

      // Enter buy-in that brings total to >$9,000 (8500 + 1000 = 9500)
      await enterBuyInAmount(page, 1000);

      // Click Save Changes
      const saveButton = modal.locator('button:has-text("Save Changes")');
      await saveButton.click();

      // Verify CTR approaching toast appears
      const toast = page.locator('text="CTR threshold approaching"');
      await expect(toast).toBeVisible({ timeout: 5000 });
    } finally {
      await testScenario.cleanup();
    }
  });

  /**
   * Test 4: CTR banner displayed at >$10,000 daily total
   *
   * Scenario: Enter buy-in that brings total to >$10,000
   * Expected: CTR banner appears with regulatory reference
   */
  test('CTR banner and error toast when buy-in brings total to >$10,000', async ({
    page,
  }) => {
    const testScenario = await createMtlTestScenario();

    try {
      // Pre-populate to bring close to CTR threshold
      await createTestMtlEntry(testScenario, 9500, 'in', 'buy_in');

      // Authenticate
      await authenticateUser(page, testScenario);

      // Open modal
      const modal = await openRatingSlipModal(page, testScenario);

      // Enter buy-in that crosses CTR threshold (9500 + 600 = 10100 > 10000)
      await enterBuyInAmount(page, 600);

      // Click Save Changes
      const saveButton = modal.locator('button:has-text("Save Changes")');
      await saveButton.click();

      // Verify CTR REQUIRED toast appears
      const toast = page.locator('text="CTR REQUIRED"');
      await expect(toast).toBeVisible({ timeout: 5000 });

      // Verify CTR banner appears with regulatory reference
      const ctrBanner = page.locator('[role="alert"]');
      await expect(ctrBanner).toBeVisible({ timeout: 5000 });

      // Verify regulatory reference
      await expect(ctrBanner).toContainText('31 CFR § 1021.311');

      // Verify FinCEN link
      const fincenLink = ctrBanner.locator('a[href*="fincen.gov"]');
      await expect(fincenLink).toBeVisible();
      await expect(fincenLink).toHaveAttribute('rel', 'noopener noreferrer');
    } finally {
      await testScenario.cleanup();
    }
  });

  /**
   * Test 5: Auto-created MTL visible in compliance dashboard
   *
   * Scenario: After threshold-triggered MTL creation, navigate to dashboard
   * Expected: New MTL entry appears in compliance dashboard list
   */
  test('auto-created MTL visible in compliance dashboard', async ({ page }) => {
    const testScenario = await createMtlTestScenario();

    try {
      // Create MTL entry at watchlist threshold
      await createTestMtlEntry(testScenario, 3500, 'in', 'buy_in');

      // Authenticate
      await authenticateUser(page, testScenario);

      // Navigate to compliance dashboard
      await page.goto('/compliance');

      // Wait for dashboard to load
      await page.waitForSelector('[data-testid="compliance-dashboard"]', {
        timeout: 10000,
      });

      // Verify MTL entry appears in list
      const mtlEntry = page.locator('[data-testid="mtl-entry-row"]').first();
      await expect(mtlEntry).toBeVisible({ timeout: 5000 });

      // Verify amount is displayed
      await expect(mtlEntry).toContainText('$3,500');
    } finally {
      await testScenario.cleanup();
    }
  });

  /**
   * Test 6: Manual entry via dashboard form
   *
   * Scenario: Click "New Entry" button, fill form, submit
   * Expected: Entry created, success toast, entry appears in list
   */
  test('manual MTL entry via compliance dashboard form', async ({ page }) => {
    const testScenario = await createMtlTestScenario();

    try {
      // Authenticate
      await authenticateUser(page, testScenario);

      // Navigate to compliance dashboard
      await page.goto('/compliance');
      await page.waitForSelector('[data-testid="compliance-dashboard"]', {
        timeout: 10000,
      });

      // Click New Entry button
      const newEntryButton = page.locator('button:has-text("New Entry")');
      await expect(newEntryButton).toBeVisible();
      await newEntryButton.click();

      // Wait for form dialog
      const formDialog = page.locator('[role="dialog"]');
      await expect(formDialog).toBeVisible({ timeout: 5000 });

      // Fill form fields
      // Select transaction type
      const txnTypeSelect = formDialog.locator(
        '[data-testid="txn-type-select"]',
      );
      await txnTypeSelect.click();
      await page.locator('text="1. Purchase of Chips/Tokens"').click();

      // Enter amount
      const amountInput = formDialog.locator('input[name="amount"]');
      await amountInput.fill('5000');

      // Enter note (required)
      const noteInput = formDialog.locator('textarea[name="note"]');
      await noteInput.fill('Manual MTL entry for E2E test');

      // Submit form
      const submitButton = formDialog.locator('button[type="submit"]');
      await submitButton.click();

      // Verify success toast
      const successToast = page.locator('text="MTL entry created"');
      await expect(successToast).toBeVisible({ timeout: 5000 });

      // Verify entry appears in list
      const entries = await getMtlEntriesForPatron(testScenario);
      const manualEntry = entries.find((e) => e.amount === 5000);
      expect(manualEntry).toBeDefined();
    } finally {
      await testScenario.cleanup();
    }
  });

  /**
   * Test 7: Threshold indicator shows correct projected total
   *
   * Scenario: Open modal, enter buy-in amount
   * Expected: BuyInThresholdIndicator shows current, new, and projected total
   */
  test('threshold indicator shows correct projected total', async ({
    page,
  }) => {
    const testScenario = await createMtlTestScenario();

    try {
      // Pre-populate some transactions
      await createTestMtlEntry(testScenario, 2000, 'in', 'buy_in');

      // Authenticate
      await authenticateUser(page, testScenario);

      // Open modal
      const modal = await openRatingSlipModal(page, testScenario);

      // Enter buy-in amount
      await enterBuyInAmount(page, 500);

      // Verify threshold indicator appears
      const indicator = modal.locator('[role="status"]');
      await expect(indicator).toBeVisible({ timeout: 5000 });

      // Verify amounts displayed
      await expect(indicator).toContainText('$2,000'); // Current daily total
      await expect(indicator).toContainText('$500'); // New buy-in
      await expect(indicator).toContainText('$2,500'); // Projected total

      // At $2,500, should show "Approaching" label
      await expect(indicator).toContainText('Approaching');
    } finally {
      await testScenario.cleanup();
    }
  });
});

// ============================================================================
// API-Level Tests for MTL BFF Endpoint
// ============================================================================

test.describe('MTL Threshold API Tests', () => {
  let scenario: MtlTestScenario;

  test.beforeAll(async () => {
    scenario = await createMtlTestScenario();
  });

  test.afterAll(async () => {
    if (scenario) {
      await scenario.cleanup();
    }
  });

  test('GET gaming-day-summary returns correct threshold badges', async ({
    request,
  }) => {
    // Create entry to trigger watchlist badge
    await createTestMtlEntry(scenario, 3500, 'in', 'buy_in');

    const response = await request.get(
      `/api/v1/mtl/gaming-day-summary?casino_id=${scenario.casinoId}&gaming_day=${scenario.gamingDay}`,
      {
        headers: {
          Authorization: `Bearer ${scenario.authToken}`,
        },
      },
    );

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Find patron's summary
    const patronSummary = body.data?.items?.find(
      (s: { patron_uuid: string }) => s.patron_uuid === scenario.playerId,
    );

    expect(patronSummary).toBeDefined();
    expect(patronSummary.total_in).toBe(3500);
    expect(patronSummary.agg_badge_in).toBe('agg_watchlist');
  });

  test('POST mtl/entries creates entry with idempotency', async ({
    request,
  }) => {
    const idempotencyKey = `e2e_test_${Date.now()}`;

    // First request
    const response1 = await request.post(`/api/v1/mtl/entries`, {
      headers: {
        Authorization: `Bearer ${scenario.authToken}`,
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      data: {
        casino_id: scenario.casinoId,
        patron_uuid: scenario.playerId,
        staff_id: scenario.staffId,
        amount: 1000,
        direction: 'in',
        txn_type: 'buy_in',
        source: 'table',
      },
    });

    expect(response1.ok()).toBeTruthy();
    const body1 = await response1.json();
    const entryId = body1.data?.id;
    expect(entryId).toBeDefined();

    // Second request with same idempotency key
    const response2 = await request.post(`/api/v1/mtl/entries`, {
      headers: {
        Authorization: `Bearer ${scenario.authToken}`,
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      data: {
        casino_id: scenario.casinoId,
        patron_uuid: scenario.playerId,
        staff_id: scenario.staffId,
        amount: 1000,
        direction: 'in',
        txn_type: 'buy_in',
        source: 'table',
      },
    });

    expect(response2.ok()).toBeTruthy();
    const body2 = await response2.json();

    // Should return same entry (idempotent)
    expect(body2.data?.id).toBe(entryId);
    expect(body2.data?.isExisting).toBe(true);
  });
});

// ============================================================================
// CTR Banner Component Tests
// ============================================================================

test.describe('CTR Banner Display', () => {
  test('CTR banner can be dismissed', async ({ page }) => {
    const testScenario = await createMtlTestScenario();

    try {
      // Create entry above CTR threshold
      await createTestMtlEntry(testScenario, 10500, 'in', 'buy_in');

      // Authenticate
      await authenticateUser(page, testScenario);

      // Open modal
      const modal = await openRatingSlipModal(page, testScenario);

      // CTR banner should be visible
      const ctrBanner = modal.locator('[role="alert"]');
      await expect(ctrBanner).toBeVisible({ timeout: 5000 });

      // Click dismiss button
      const dismissButton = ctrBanner.locator(
        'button[aria-label="Dismiss CTR notification"]',
      );
      await dismissButton.click();

      // Banner should disappear
      await expect(ctrBanner).not.toBeVisible({ timeout: 2000 });
    } finally {
      await testScenario.cleanup();
    }
  });

  test('CTR banner dismissal persists in session', async ({ page }) => {
    const testScenario = await createMtlTestScenario();

    try {
      // Create entry above CTR threshold
      await createTestMtlEntry(testScenario, 10500, 'in', 'buy_in');

      // Authenticate
      await authenticateUser(page, testScenario);

      // Open modal
      let modal = await openRatingSlipModal(page, testScenario);

      // Dismiss CTR banner
      const ctrBanner = modal.locator('[role="alert"]');
      await expect(ctrBanner).toBeVisible({ timeout: 5000 });

      const dismissButton = ctrBanner.locator(
        'button[aria-label="Dismiss CTR notification"]',
      );
      await dismissButton.click();
      await expect(ctrBanner).not.toBeVisible({ timeout: 2000 });

      // Close modal
      const closeButton = modal.locator('button[aria-label="Close"]');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      } else {
        await page.keyboard.press('Escape');
      }

      // Re-open modal
      modal = await openRatingSlipModal(page, testScenario);

      // CTR banner should NOT reappear (dismissed in session)
      const ctrBannerAgain = modal.locator('[role="alert"]');
      await expect(ctrBannerAgain).not.toBeVisible({ timeout: 2000 });
    } finally {
      await testScenario.cleanup();
    }
  });
});
