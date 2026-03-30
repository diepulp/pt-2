/**
 * Player Exclusion — E2E — Mode B (browser login)
 *
 * Tests the exclusion compliance panel CRUD lifecycle and role gating
 * via the real browser/app surface.
 *
 * Auth: Mode B — Playwright navigates to /auth/login, real JWT via cookies.
 * Verification class: E2E (canonical browser surface under test).
 *
 * @see QA-006 §1 — Auth Mode B selection rationale
 * @see GAP-EXCL-E2E-001 — Gap being closed
 */

import { test, expect } from '@playwright/test';

import type { ExclusionPanelScenario } from '../fixtures/exclusion-fixtures';
import {
  authenticateAndNavigate,
  createExclusionPanelScenario,
  seedExclusion,
} from '../fixtures/exclusion-fixtures';

// ============================================================================
// CRUD Lifecycle — Admin creates and lifts an exclusion
// ============================================================================

test.describe('Player Exclusion CRUD — E2E — Mode B (browser login)', () => {
  test.describe.configure({ mode: 'serial' });

  let scenario: ExclusionPanelScenario;

  test.beforeAll(async () => {
    scenario = await createExclusionPanelScenario('admin');
  });

  test.afterAll(async () => {
    await scenario?.cleanup();
  });

  /** Navigate to Player 360 → Compliance tab. Reused across serial tests. */
  async function navigateToComplianceTab(
    page: import('@playwright/test').Page,
  ) {
    await authenticateAndNavigate(
      page,
      scenario.testEmail,
      scenario.testPassword,
      `/players/${scenario.playerId}`,
    );
    // Click the right-rail Compliance tab (last "Compliance" button — sidebar one is first)
    await page.getByRole('button', { name: 'Compliance' }).last().click();
    // Wait for ExclusionTile to render after tab switch
    await page
      .getByText('Exclusions', { exact: true })
      .waitFor({ state: 'visible' });
  }

  test('should show empty state before any exclusions', async ({ page }) => {
    await navigateToComplianceTab(page);
    await expect(page.getByText('No active exclusions')).toBeVisible();
  });

  test('should create a hard_block exclusion via dialog', async ({ page }) => {
    await navigateToComplianceTab(page);

    // Open create dialog
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Add Exclusion' }),
    ).toBeVisible();

    // Fill form fields
    // Type select (shadcn/radix Select — click trigger, then option)
    await page.locator('#exclusion_type').click();
    await page.getByRole('option', { name: 'Self Exclusion' }).click();

    // Enforcement select
    await page.locator('#enforcement').click();
    await page.getByRole('option', { name: 'Hard Block' }).click();

    // Reason (required textarea)
    await page.locator('#reason').fill('E2E test: self-exclusion hard block');

    // Submit and wait for success toast (more resilient than waitForResponse)
    await page.getByRole('button', { name: 'Create Exclusion' }).click();
    await expect(page.getByText('Exclusion created')).toBeVisible({
      timeout: 10_000,
    });

    // Verify exclusion row appears in tile
    // Note: tile row renders exclusion_type.replace('_', ' ') with CSS capitalize
    // and enforcement.replace('_', ' ') without capitalize — DOM text is lowercase.
    await expect(page.getByText(/self exclusion/i)).toBeVisible();
    await expect(page.getByText('hard block', { exact: true })).toBeVisible();
    await expect(page.getByText('1 active')).toBeVisible();
  });

  test('should lift the exclusion via dialog', async ({ page }) => {
    await navigateToComplianceTab(page);

    // Wait for the active exclusion to render
    await expect(page.getByText('1 active')).toBeVisible();

    // Click Lift on the exclusion row
    await page.getByRole('button', { name: 'Lift' }).click();
    await expect(
      page.getByRole('heading', { name: 'Lift Exclusion' }),
    ).toBeVisible();

    // Verify summary shows the exclusion details (scoped to dialog to avoid tile duplicates)
    const liftDialog = page.getByLabel('Lift Exclusion');
    await expect(liftDialog.getByText('self exclusion')).toBeVisible();
    await expect(
      liftDialog.getByText('hard block', { exact: true }),
    ).toBeVisible();

    // Verify submit button is disabled without reason
    await expect(
      page.getByRole('button', { name: 'Lift Exclusion' }),
    ).toBeDisabled();

    // Fill lift reason
    await page
      .locator('#lift_reason')
      .fill('E2E test: lifting self-exclusion for verification');

    // Submit and wait for success toast
    await page.getByRole('button', { name: 'Lift Exclusion' }).click();
    await expect(page.getByText('Exclusion lifted')).toBeVisible({
      timeout: 10_000,
    });

    // Verify tile returns to empty state
    await expect(page.getByText('No active exclusions')).toBeVisible();
  });

  /**
   * Date-field regression test (DATE-MISMATCH.md).
   *
   * Commit 14e02c5 re-introduced toISO converters that converted YYYY-MM-DD
   * to ISO datetime, failing the server's dateSchema() regex. This test
   * ensures the full browser→API→schema→DB path accepts date fields.
   *
   * Runs after lift test (state: no active exclusions) so it can create fresh.
   */
  test('should create exclusion with date fields (YYYY-MM-DD regression)', async ({
    page,
  }) => {
    await navigateToComplianceTab(page);

    // Open create dialog
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Add Exclusion' }),
    ).toBeVisible();

    // Fill required fields
    await page.locator('#exclusion_type').click();
    await page.getByRole('option', { name: 'Regulatory' }).click();

    await page.locator('#enforcement').click();
    await page.getByRole('option', { name: 'Hard Block' }).click();

    await page
      .locator('#reason')
      .fill('E2E date regression: all three date fields');

    // Fill all three date fields — the regression seam
    await page.locator('#effective_from').fill('2026-04-01');
    await page.locator('#effective_until').fill('2026-12-31');
    await page.locator('#review_date').fill('2026-06-15');

    // Submit — if toISO converters are present, server rejects with
    // "effective_from must be YYYY-MM-DD format"
    await page.getByRole('button', { name: 'Create Exclusion' }).click();
    await expect(page.getByText('Exclusion created')).toBeVisible({
      timeout: 10_000,
    });

    // Verify exclusion appears in tile
    await expect(page.getByText(/regulatory/i)).toBeVisible();
    await expect(page.getByText('hard block', { exact: true })).toBeVisible();
  });
});

// ============================================================================
// Role Gating — Button visibility per staff role
// ============================================================================

test.describe('Player Exclusion Role Gating — E2E — Mode B (browser login)', () => {
  // Parallel: each test uses its own scenario with a different role
  test.describe.configure({ mode: 'parallel' });

  test('pit_boss should see Add button but not Lift button', async ({
    page,
  }) => {
    const scenario = await createExclusionPanelScenario('pit_boss');
    try {
      // Seed an exclusion so Lift button would appear if permitted
      await seedExclusion(
        scenario.casinoId,
        scenario.playerId,
        scenario.staffId,
        'hard_block',
      );

      await authenticateAndNavigate(
        page,
        scenario.testEmail,
        scenario.testPassword,
        `/players/${scenario.playerId}`,
      );
      await page.getByRole('button', { name: 'Compliance' }).last().click();
      await page
        .getByText('Exclusions', { exact: true })
        .waitFor({ state: 'visible' });

      // pit_boss CAN create exclusions
      await expect(
        page.getByRole('button', { name: 'Add', exact: true }),
      ).toBeVisible();

      // pit_boss CANNOT lift exclusions — Lift button should not exist
      await expect(
        page.getByRole('button', { name: 'Lift' }),
      ).not.toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });

  test('dealer should see neither Add nor Lift button', async ({ page }) => {
    const scenario = await createExclusionPanelScenario('dealer');
    try {
      // Seed exclusion so buttons would appear if permitted
      await seedExclusion(
        scenario.casinoId,
        scenario.playerId,
        scenario.staffId,
        'hard_block',
      );

      await authenticateAndNavigate(
        page,
        scenario.testEmail,
        scenario.testPassword,
        `/players/${scenario.playerId}`,
      );
      await page.getByRole('button', { name: 'Compliance' }).last().click();
      await page
        .getByText('Exclusions', { exact: true })
        .waitFor({ state: 'visible' });

      // dealer CANNOT create or lift
      await expect(
        page.getByRole('button', { name: 'Add', exact: true }),
      ).not.toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Lift' }),
      ).not.toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });
});

// ============================================================================
// Enforcement — Hard Block Prevents Seating in New Slip Modal
// ============================================================================

test.describe('Exclusion Enforcement in New Slip Modal — E2E — Mode B (browser login)', () => {
  // This test requires pit dashboard infrastructure (floor layout, table
  // sessions, seat selection). It builds on rating-slip-fixtures for setup.
  //
  // GAP-EXCL-E2E-001 remains PARTIALLY RESOLVED until this is implemented.
  // The pit-path enforcement surface is the most operationally canonical
  // test — it's where a real pit boss would encounter the block.

  test.skip(
    true,
    'Blocked on pit dashboard fixture complexity — see plan Task 5',
  );

  // Implementation outline:
  // 1. Create rating-slip scenario (provides active table session on /pit)
  // 2. Create additional player linked to same casino
  // 3. Seed hard_block exclusion for that player via seedExclusion()
  // 4. Navigate to /pit, open table panel, click empty seat
  // 5. Search for excluded player in new-slip modal (#player-search)
  // 6. Select player, choose seat, click "Start Slip"
  // 7. Assert error: "This player has an active exclusion and cannot be seated."
  // 8. Verify no slip was created
});
