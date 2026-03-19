/**
 * Loyalty Admin Catalog E2E Smoke Test (EXEC-LOYALTY-ADMIN-CATALOG WS6)
 *
 * Happy-path smoke flow: create reward -> configure pricing -> activate -> verify in list.
 *
 * Uses createAdminTestScenario (admin role) for full RLS-enabled test isolation.
 * Seeds one reward via service-role to verify list renders, then creates a
 * second reward via the UI dialog, navigates to detail, configures pricing,
 * toggles active, and navigates back to verify list state.
 *
 * @see docs/21-exec-spec/EXEC-LOYALTY-ADMIN-CATALOG.md WS6
 * @see e2e/fixtures/admin-helpers.ts — Auth fixture
 */

import { test, expect } from '@playwright/test';

import {
  authenticateAdmin,
  createAdminTestScenario,
  type AdminTestScenario,
} from '../fixtures/admin-helpers';
import { createServiceClient } from '../fixtures/test-data';

// ── Test Data ────────────────────────────────────────────────────────────────

const SMOKE_SUFFIX = Date.now();
const SEEDED_REWARD = {
  code: `SEED_SMOKE_${SMOKE_SUFFIX}`,
  name: `Seeded Smoke Reward ${SMOKE_SUFFIX}`,
  kind: 'comp_meal',
  family: 'points_comp' as const,
  is_active: true,
};

const NEW_REWARD = {
  code: `SMOKE_${SMOKE_SUFFIX}`,
  name: `Smoke Test Reward ${SMOKE_SUFFIX}`,
  kind: 'comp_beverage',
};

// ── Scenario Lifecycle ───────────────────────────────────────────────────────

let scenario: AdminTestScenario;

test.beforeAll(async () => {
  scenario = await createAdminTestScenario('admin');

  // Seed one reward so the list page has data on first load
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('reward_catalog')
    .insert({
      casino_id: scenario.casinoId,
      code: SEEDED_REWARD.code,
      name: SEEDED_REWARD.name,
      kind: SEEDED_REWARD.kind,
      family: SEEDED_REWARD.family,
      is_active: SEEDED_REWARD.is_active,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to seed reward: ${error?.message}`);
  }
});

test.afterAll(async () => {
  // Clean up test rewards and scenario
  const supabase = createServiceClient();

  // Delete reward_price_points rows (FK to reward_catalog)
  await supabase
    .from('reward_price_points')
    .delete()
    .eq('casino_id', scenario.casinoId);

  // Delete reward_entitlement_tier rows
  await supabase
    .from('reward_entitlement_tier')
    .delete()
    .eq('casino_id', scenario.casinoId);

  // Delete reward_eligibility rows
  await supabase
    .from('reward_eligibility')
    .delete()
    .eq('casino_id', scenario.casinoId);

  // Delete all rewards for this casino
  await supabase
    .from('reward_catalog')
    .delete()
    .eq('casino_id', scenario.casinoId);

  await scenario?.cleanup();
});

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Loyalty Admin Catalog', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAdmin(page, scenario.testEmail, scenario.testPassword);
  });

  test('create reward -> configure pricing -> activate -> verify in list', async ({
    page,
  }) => {
    // Increase timeout for full E2E flow
    test.setTimeout(90_000);

    // ── Step 1: Navigate to reward list page ──────────────────────────────
    await page.goto('/admin/loyalty/rewards', {
      waitUntil: 'domcontentloaded',
    });

    // ── Step 2: Verify list page renders with heading ─────────────────────
    await expect(
      page.getByRole('heading', { name: 'Reward Catalog' }),
    ).toBeVisible({ timeout: 15_000 });

    // Verify the seeded reward is in the list
    await expect(page.getByText(SEEDED_REWARD.name)).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 3: Open "Add Reward" dialog ──────────────────────────────────
    await page.locator('[data-testid="add-reward-button"]').click();

    // Verify dialog is open
    await expect(
      page.locator('[data-testid="create-reward-dialog"]'),
    ).toBeVisible({ timeout: 5_000 });

    // ── Step 4: Fill the create reward form ───────────────────────────────
    // Family defaults to points_comp — leave as-is for this test

    // Code
    await page
      .locator('[data-testid="reward-code-input"]')
      .fill(NEW_REWARD.code);

    // Name
    await page
      .locator('[data-testid="reward-name-input"]')
      .fill(NEW_REWARD.name);

    // Kind
    await page
      .locator('[data-testid="reward-kind-input"]')
      .fill(NEW_REWARD.kind);

    // Fulfillment — select "Comp Slip"
    await page.getByLabel('Fulfillment type').click();
    await page.getByRole('option', { name: 'Comp Slip' }).click();

    // ── Step 5: Submit and verify new reward appears in list ──────────────
    await page.locator('[data-testid="create-reward-submit"]').click();

    // Dialog should close on success
    await expect(
      page.locator('[data-testid="create-reward-dialog"]'),
    ).not.toBeVisible({ timeout: 10_000 });

    // New reward should appear in the list
    await expect(page.getByText(NEW_REWARD.name)).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 6: Click new reward row to navigate to detail page ───────────
    // Find the table row containing the new reward and click it
    const rewardRow = page
      .getByRole('row')
      .filter({ hasText: NEW_REWARD.name });
    await rewardRow.click();

    // Verify we navigated to the detail page
    await expect(page.locator('[data-testid="reward-detail"]')).toBeVisible({
      timeout: 10_000,
    });

    // Verify the reward name is displayed
    await expect(page.locator('[data-testid="reward-detail-name"]')).toHaveText(
      NEW_REWARD.name,
    );

    // ── Step 7: Fill points pricing ───────────────────────────────────────
    await expect(
      page.locator('[data-testid="points-pricing-form"]'),
    ).toBeVisible({ timeout: 5_000 });

    const pointsCostInput = page.locator('[data-testid="points-cost-input"]');
    await pointsCostInput.clear();
    await pointsCostInput.fill('500');

    // Verify allow-overdraw toggle is off (default)
    const overdrawToggle = page.locator(
      '[data-testid="allow-overdraw-toggle"]',
    );
    await expect(overdrawToggle).toHaveAttribute('data-state', 'unchecked');

    // ── Step 8: Save pricing and verify success ───────────────────────────
    const savePricingButton = page.locator(
      '[data-testid="save-pricing-button"]',
    );
    await expect(savePricingButton).toBeEnabled();
    await savePricingButton.click();

    // Verify success toast appears
    await expect(page.getByText('Points pricing saved')).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 9: Toggle activate switch ────────────────────────────────────
    // New rewards start as inactive (is_active defaults to false)
    const activeToggle = page.locator(
      '[data-testid="reward-detail-active-toggle"]',
    );

    // Verify inactive state text
    await expect(page.getByText('Inactive')).toBeVisible();

    // Toggle to active
    await activeToggle.click();

    // Verify the toggle flipped to active
    await expect(page.getByText('Active')).toBeVisible({ timeout: 10_000 });

    // Verify success toast for activation
    await expect(page.getByText('activated', { exact: false })).toBeVisible({
      timeout: 5_000,
    });

    // ── Step 10: Navigate back to list and verify active status ───────────
    await page.locator('[data-testid="back-to-rewards"]').click();

    // Verify we're back on the list page
    await expect(
      page.getByRole('heading', { name: 'Reward Catalog' }),
    ).toBeVisible({ timeout: 10_000 });

    // Verify the newly created + activated reward is in the list
    await expect(page.getByText(NEW_REWARD.name)).toBeVisible({
      timeout: 10_000,
    });
  });
});
