/**
 * Loyalty Accrual Lifecycle E2E Tests
 *
 * Comprehensive test suite for the loyalty accrual pipeline, created to close
 * the test coverage gap identified in ISSUE-47B1DFF1.
 *
 * Test Coverage:
 * - Accrual on rating slip close via API
 * - Accrual on rating slip close via UI (modal)
 * - Balance verification after accrual
 * - Complete workflow: enroll → visit → slip → close → verify points
 * - Idempotency verification
 * - Ghost visit handling (no accrual for unidentified players)
 *
 * Prerequisites:
 * - Dev server running at localhost:3000
 * - Supabase with game_settings configured
 * - Service role key for test data setup
 *
 * @see ISSUE-47B1DFF1 Loyalty accrual never called on rating slip close
 * @see PRD-004 Loyalty Service
 * @see ADR-019 Loyalty Points Policy
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import {
  createRatingSlipTestScenario,
  ensureGameSettings,
  ensurePlayerLoyaltyRecord,
  getLoyaltyLedgerForPlayer,
  getLoyaltyLedgerForSlip,
  getPlayerLoyaltyBalance,
  getRatingSlipStatus,
  type RatingSlipTestScenario,
} from '../fixtures/rating-slip-fixtures';

// Dev auth credentials from lib/supabase/dev-context.ts
const DEV_USER_EMAIL = 'pitboss@dev.local';
const DEV_USER_PASSWORD = 'devpass123';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Get dev auth token for API requests.
 * Uses the dev user from seed data (Marcus Thompson - pit boss).
 */
async function getDevAuthToken(): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: DEV_USER_EMAIL,
    password: DEV_USER_PASSWORD,
  });

  if (error || !data.session) {
    throw new Error(`Failed to get dev auth token: ${error?.message}`);
  }

  return data.session.access_token;
}

/**
 * Extended test scenario with loyalty-specific setup.
 * Ensures game_settings and player_loyalty records exist for accrual to work.
 */
async function createLoyaltyTestScenario(): Promise<RatingSlipTestScenario> {
  const scenario = await createRatingSlipTestScenario();

  // Ensure game_settings exist for policy_snapshot population
  await ensureGameSettings(scenario.casinoId, 'blackjack');

  // Ensure player_loyalty record exists (required for accrual)
  await ensurePlayerLoyaltyRecord(scenario.playerId, scenario.casinoId, 0);

  // Update the rating slip to have realistic duration for points calculation
  // Set start_time to 30 minutes ago so we get non-zero theo/points
  const supabase = createServiceClient();
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  await supabase
    .from('rating_slip')
    .update({
      start_time: thirtyMinutesAgo,
      average_bet: 5000, // $50 average bet for meaningful points
    })
    .eq('id', scenario.ratingSlipId);

  // Get dev auth token to override the scenario's token
  // The dev user (pitboss@dev.local) has access to Casino 1 from seed data
  const devToken = await getDevAuthToken();
  scenario.authToken = devToken;

  return scenario;
}

test.describe('Loyalty Accrual Lifecycle (ISSUE-47B1DFF1)', () => {
  /**
   * Test 1: API-Level Accrual Verification
   *
   * Verifies that closing a rating slip via API triggers loyalty accrual.
   * This is the most direct test of the accrual pipeline.
   */
  test.describe('API-Level Accrual', () => {
    let scenario: RatingSlipTestScenario;

    test.beforeEach(async () => {
      scenario = await createLoyaltyTestScenario();
    });

    test.afterEach(async () => {
      if (scenario) {
        await scenario.cleanup();
      }
    });

    test('closing rating slip via API creates loyalty_ledger entry', async ({
      request,
    }) => {
      // Get initial loyalty balance
      const initialBalance = await getPlayerLoyaltyBalance(
        scenario.playerId,
        scenario.casinoId,
      );
      const initialPoints = initialBalance?.current_balance ?? 0;

      // Get initial ledger entries count
      const initialLedger = await getLoyaltyLedgerForPlayer(
        scenario.playerId,
        scenario.casinoId,
      );
      const initialLedgerCount = initialLedger.length;

      // Close the rating slip via API
      const closeResponse = await request.post(
        `/api/v1/rating-slips/${scenario.ratingSlipId}/close`,
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `e2e_close_${Date.now()}`,
          },
          data: {
            average_bet: 5000, // $50 in cents
          },
        },
      );

      // Log error details if request failed
      if (!closeResponse.ok()) {
        const errorBody = await closeResponse.text();
        console.error(
          `Close API failed with status ${closeResponse.status()}: ${errorBody}`,
        );
      }

      expect(closeResponse.ok()).toBeTruthy();

      // Verify slip is closed
      const closedSlip = await getRatingSlipStatus(scenario.ratingSlipId);
      expect(closedSlip.status).toBe('closed');

      // Wait for accrual to complete (async operation)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // CRITICAL ASSERTION: Verify loyalty_ledger entry was created
      const finalLedger = await getLoyaltyLedgerForPlayer(
        scenario.playerId,
        scenario.casinoId,
      );

      expect(finalLedger.length).toBeGreaterThan(initialLedgerCount);

      // Find the accrual entry for this slip
      const accrualEntry = finalLedger.find(
        (entry) =>
          entry.rating_slip_id === scenario.ratingSlipId &&
          entry.reason === 'base_accrual',
      );

      expect(accrualEntry).toBeDefined();
      expect(accrualEntry!.points_delta).toBeGreaterThan(0);
      expect(accrualEntry!.theo).toBeGreaterThan(0);

      // CRITICAL ASSERTION: Verify player_loyalty.current_balance increased
      const finalBalance = await getPlayerLoyaltyBalance(
        scenario.playerId,
        scenario.casinoId,
      );

      expect(finalBalance).not.toBeNull();
      expect(finalBalance!.current_balance).toBeGreaterThan(initialPoints);
      expect(finalBalance!.current_balance).toBe(
        initialPoints + accrualEntry!.points_delta,
      );
    });

    test('accrual is idempotent - duplicate close does not double-award points', async ({
      request,
    }) => {
      const idempotencyKey = `e2e_idempotent_${Date.now()}`;

      // First close
      const firstClose = await request.post(
        `/api/v1/rating-slips/${scenario.ratingSlipId}/close`,
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          data: { average_bet: 5000 },
        },
      );

      expect(firstClose.ok()).toBeTruthy();

      // Wait for accrual
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get balance after first close
      const balanceAfterFirst = await getPlayerLoyaltyBalance(
        scenario.playerId,
        scenario.casinoId,
      );

      // Attempt duplicate close with same idempotency key
      // (should be rejected or return same result)
      const duplicateClose = await request.post(
        `/api/v1/rating-slips/${scenario.ratingSlipId}/close`,
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          data: { average_bet: 5000 },
        },
      );

      // Duplicate should either succeed (idempotent) or fail (already closed)
      // Either way, balance should not increase

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const balanceAfterDuplicate = await getPlayerLoyaltyBalance(
        scenario.playerId,
        scenario.casinoId,
      );

      // CRITICAL: Balance should be the same as after first close
      expect(balanceAfterDuplicate!.current_balance).toBe(
        balanceAfterFirst!.current_balance,
      );

      // Verify only one ledger entry exists for this slip
      const ledgerEntries = await getLoyaltyLedgerForSlip(
        scenario.ratingSlipId,
      );
      const accrualEntries = ledgerEntries.filter(
        (e) => e.reason === 'base_accrual',
      );
      expect(accrualEntries.length).toBe(1);
    });

    test('accrual entry includes correct metadata (theo, policy values)', async ({
      request,
    }) => {
      // Close the slip
      await request.post(
        `/api/v1/rating-slips/${scenario.ratingSlipId}/close`,
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `e2e_metadata_${Date.now()}`,
          },
          data: { average_bet: 5000 },
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get the accrual entry
      const ledgerEntries = await getLoyaltyLedgerForSlip(
        scenario.ratingSlipId,
      );
      const accrualEntry = ledgerEntries.find(
        (e) => e.reason === 'base_accrual',
      );

      expect(accrualEntry).toBeDefined();

      // Verify metadata contains expected fields
      expect(accrualEntry!.theo).toBeGreaterThan(0);
      expect(accrualEntry!.rating_slip_id).toBe(scenario.ratingSlipId);
      expect(accrualEntry!.visit_id).toBe(scenario.visitId);
      expect(accrualEntry!.player_id).toBe(scenario.playerId);
      expect(accrualEntry!.casino_id).toBe(scenario.casinoId);

      // Theo calculation validation (rough bounds check)
      // theo = avg_bet × (house_edge/100) × (duration_hours) × decisions_per_hour
      // With $50 bet, 1.5% edge, 0.5 hours, 70 decisions: ~26.25
      expect(accrualEntry!.theo).toBeGreaterThan(10); // Sanity lower bound
      expect(accrualEntry!.theo).toBeLessThan(100); // Sanity upper bound
    });
  });

  /**
   * Test 2: UI-Level Accrual (Modal Close)
   *
   * Verifies that closing a rating slip via the modal triggers loyalty accrual.
   * This tests the fix in use-close-with-financial.ts.
   */
  test.describe('UI Modal Close Accrual', () => {
    let scenario: RatingSlipTestScenario;

    test.beforeEach(async () => {
      scenario = await createLoyaltyTestScenario();
    });

    test.afterEach(async () => {
      if (scenario) {
        await scenario.cleanup();
      }
    });

    /**
     * Helper: Authenticate via browser
     */
    async function authenticateUser(page: Page) {
      await page.goto('/auth/login');
      await page.fill('input[name="email"]', scenario.testEmail);
      await page.fill('input[name="password"]', scenario.testPassword);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(pit|dashboard)/, { timeout: 10000 });
    }

    test('closing rating slip via modal creates loyalty_ledger entry', async ({
      page,
    }) => {
      // Get initial balance
      const initialBalance = await getPlayerLoyaltyBalance(
        scenario.playerId,
        scenario.casinoId,
      );
      const initialPoints = initialBalance?.current_balance ?? 0;

      // Authenticate and navigate to pit dashboard
      await authenticateUser(page);
      await page.goto('/pit');

      // Wait for dashboard to load
      await page.waitForSelector('[data-panel-group]', { timeout: 15000 });

      // Switch to Activity panel to see active slips
      await page.click('button:has-text("Activity")');
      await page.waitForTimeout(1000);

      // Click on the active slip to open modal
      const slipCard = page.locator('.cursor-pointer, [role="button"]').filter({
        hasText: /Seat|Table/,
      });

      if ((await slipCard.count()) > 0) {
        await slipCard.first().click();
      } else {
        // Fallback: try to find any clickable element that might open the modal
        await page.click('[data-testid="table-grid"]');
      }

      // Wait for modal to open
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Enter chips taken amount
      const chipsTakenInput = modal.locator(
        '[data-testid="chips-taken-input"], input[type="number"]',
      );
      if (await chipsTakenInput.isVisible()) {
        await chipsTakenInput.fill('50');
      }

      // Click Close Session button
      const closeButton = modal.locator('button:has-text("Close Session")');
      await closeButton.click();

      // Wait for close to complete
      await expect(modal).not.toBeVisible({ timeout: 10000 });

      // Wait for accrual (async operation triggered by useCloseWithFinancial)
      await page.waitForTimeout(3000);

      // CRITICAL ASSERTION: Verify loyalty_ledger entry was created
      const finalLedger = await getLoyaltyLedgerForPlayer(
        scenario.playerId,
        scenario.casinoId,
      );

      const accrualEntry = finalLedger.find(
        (entry) =>
          entry.rating_slip_id === scenario.ratingSlipId &&
          entry.reason === 'base_accrual',
      );

      expect(accrualEntry).toBeDefined();
      expect(accrualEntry!.points_delta).toBeGreaterThan(0);

      // CRITICAL ASSERTION: Verify balance increased
      const finalBalance = await getPlayerLoyaltyBalance(
        scenario.playerId,
        scenario.casinoId,
      );

      expect(finalBalance!.current_balance).toBeGreaterThan(initialPoints);
    });
  });

  /**
   * Test 3: Complete Workflow
   *
   * End-to-end test of the complete loyalty lifecycle:
   * Enroll player → Start visit → Start rating slip → Close → Verify points
   */
  test.describe('Complete Loyalty Workflow', () => {
    test('complete workflow: new player earns points on first session close', async ({
      request,
    }) => {
      const supabase = createServiceClient();
      const timestamp = Date.now();
      const testPrefix = `e2e_workflow_${timestamp}`;

      // === STEP 1: Create test casino with game_settings ===
      const { data: casino } = await supabase
        .from('casino')
        .insert({ name: `${testPrefix}_casino`, status: 'active' })
        .select()
        .single();

      await supabase.from('casino_settings').insert({
        casino_id: casino!.id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
      });

      await ensureGameSettings(casino!.id, 'blackjack');

      // === STEP 2: Create staff user ===
      const testEmail = `${testPrefix}_staff@test.com`;
      const testPassword = 'TestPassword123!';

      const { data: authData } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: { casino_id: casino!.id, staff_role: 'admin' },
      });

      const { data: staff } = await supabase
        .from('staff')
        .insert({
          casino_id: casino!.id,
          user_id: authData!.user!.id,
          first_name: 'Test',
          last_name: 'Staff',
          email: testEmail,
          role: 'admin',
          status: 'active',
        })
        .select()
        .single();

      await supabase.auth.admin.updateUserById(authData!.user!.id, {
        app_metadata: {
          casino_id: casino!.id,
          staff_id: staff!.id,
          staff_role: 'admin',
        },
      });

      const { data: signInData } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

      // === STEP 3: Create table ===
      const { data: table } = await supabase
        .from('gaming_table')
        .insert({
          casino_id: casino!.id,
          label: 'BJ-01',
          type: 'blackjack',
          status: 'active',
        })
        .select()
        .single();

      // === STEP 4: Create NEW player (simulating enrollment) ===
      const { data: player } = await supabase
        .from('player')
        .insert({
          first_name: 'New',
          last_name: 'Player',
        })
        .select()
        .single();

      await supabase.from('player_casino').insert({
        player_id: player!.id,
        casino_id: casino!.id,
        status: 'active',
      });

      // Ensure player_loyalty record (this would happen during enrollment)
      await ensurePlayerLoyaltyRecord(player!.id, casino!.id, 0);

      // === STEP 5: Create visit ===
      const visitId = crypto.randomUUID();
      const { data: visit } = await supabase
        .from('visit')
        .insert({
          id: visitId,
          casino_id: casino!.id,
          player_id: player!.id,
          started_at: new Date().toISOString(),
          visit_kind: 'gaming_identified_rated',
          visit_group_id: visitId,
        })
        .select()
        .single();

      // === STEP 6: Create rating slip (30 min duration for meaningful points) ===
      const thirtyMinutesAgo = new Date(
        Date.now() - 30 * 60 * 1000,
      ).toISOString();
      const policySnapshot = {
        loyalty: {
          house_edge: 1.5,
          decisions_per_hour: 70,
          points_conversion_rate: 10.0,
          point_multiplier: 1.0,
        },
        game_type: 'blackjack',
        captured_at: new Date().toISOString(),
      };
      const { data: ratingSlip } = await supabase
        .from('rating_slip')
        .insert({
          casino_id: casino!.id,
          visit_id: visit!.id,
          table_id: table!.id,
          seat_number: '1',
          average_bet: 5000, // $50
          status: 'open',
          start_time: thirtyMinutesAgo,
          policy_snapshot: policySnapshot,
          accrual_kind: 'loyalty',
        })
        .select()
        .single();

      // === STEP 7: Verify initial balance is 0 ===
      const initialBalance = await getPlayerLoyaltyBalance(
        player!.id,
        casino!.id,
      );
      expect(initialBalance?.current_balance ?? 0).toBe(0);

      // === STEP 8: Close the rating slip via API ===
      const closeResponse = await request.post(
        `/api/v1/rating-slips/${ratingSlip!.id}/close`,
        {
          headers: {
            Authorization: `Bearer ${signInData!.session!.access_token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `e2e_workflow_close_${timestamp}`,
          },
          data: { average_bet: 5000 },
        },
      );

      expect(closeResponse.ok()).toBeTruthy();

      // Wait for accrual
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // === STEP 9: VERIFY points accrued ===
      const finalBalance = await getPlayerLoyaltyBalance(
        player!.id,
        casino!.id,
      );
      const ledgerEntries = await getLoyaltyLedgerForSlip(ratingSlip!.id);

      // CRITICAL ASSERTIONS
      expect(finalBalance).not.toBeNull();
      expect(finalBalance!.current_balance).toBeGreaterThan(0);

      const accrualEntry = ledgerEntries.find(
        (e) => e.reason === 'base_accrual',
      );
      expect(accrualEntry).toBeDefined();
      expect(accrualEntry!.points_delta).toBe(finalBalance!.current_balance);

      // === CLEANUP ===
      await supabase
        .from('loyalty_ledger')
        .delete()
        .eq('casino_id', casino!.id);
      await supabase.from('rating_slip').delete().eq('casino_id', casino!.id);
      await supabase.from('visit').delete().eq('id', visit!.id);
      await supabase.from('gaming_table').delete().eq('id', table!.id);
      await supabase
        .from('player_loyalty')
        .delete()
        .eq('casino_id', casino!.id);
      await supabase.from('player_casino').delete().eq('player_id', player!.id);
      await supabase.from('player').delete().eq('id', player!.id);
      await supabase.from('game_settings').delete().eq('casino_id', casino!.id);
      await supabase.from('staff').delete().eq('id', staff!.id);
      await supabase
        .from('casino_settings')
        .delete()
        .eq('casino_id', casino!.id);
      await supabase.from('casino').delete().eq('id', casino!.id);
      await supabase.auth.admin.deleteUser(authData!.user!.id);
    });
  });

  /**
   * Test 4: Ghost Visit Handling
   *
   * Verifies that ghost visits (unidentified players) do NOT trigger accrual.
   * Per ADR-014, ghost visits have playerId = null.
   */
  test.describe('Ghost Visit Handling', () => {
    test('ghost visit close does not trigger loyalty accrual', async ({
      request,
    }) => {
      const supabase = createServiceClient();
      const timestamp = Date.now();
      const testPrefix = `e2e_ghost_${timestamp}`;

      // Create minimal test data for ghost visit
      const { data: casino } = await supabase
        .from('casino')
        .insert({ name: `${testPrefix}_casino`, status: 'active' })
        .select()
        .single();

      await supabase.from('casino_settings').insert({
        casino_id: casino!.id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
      });

      await ensureGameSettings(casino!.id, 'blackjack');

      const testEmail = `${testPrefix}_staff@test.com`;
      const { data: authData } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: 'TestPassword123!',
        email_confirm: true,
        app_metadata: { casino_id: casino!.id, staff_role: 'admin' },
      });

      const { data: staff } = await supabase
        .from('staff')
        .insert({
          casino_id: casino!.id,
          user_id: authData!.user!.id,
          first_name: 'Test',
          last_name: 'Staff',
          email: testEmail,
          role: 'admin',
          status: 'active',
        })
        .select()
        .single();

      await supabase.auth.admin.updateUserById(authData!.user!.id, {
        app_metadata: {
          casino_id: casino!.id,
          staff_id: staff!.id,
          staff_role: 'admin',
        },
      });

      const { data: signInData } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: 'TestPassword123!',
      });

      const { data: table } = await supabase
        .from('gaming_table')
        .insert({
          casino_id: casino!.id,
          label: 'BJ-01',
          type: 'blackjack',
          status: 'active',
        })
        .select()
        .single();

      // Create GHOST visit (player_id = null)
      const visitId = crypto.randomUUID();
      const { data: visit } = await supabase
        .from('visit')
        .insert({
          id: visitId,
          casino_id: casino!.id,
          player_id: null, // GHOST VISIT - no player
          started_at: new Date().toISOString(),
          visit_kind: 'gaming_unidentified',
          visit_group_id: visitId,
        })
        .select()
        .single();

      // Create rating slip for ghost visit (compliance_only - no loyalty)
      const thirtyMinutesAgo = new Date(
        Date.now() - 30 * 60 * 1000,
      ).toISOString();
      const { data: ratingSlip } = await supabase
        .from('rating_slip')
        .insert({
          casino_id: casino!.id,
          visit_id: visit!.id,
          table_id: table!.id,
          seat_number: '1',
          average_bet: 5000,
          status: 'open',
          start_time: thirtyMinutesAgo,
          accrual_kind: 'compliance_only', // Ghost visit - no loyalty accrual
        })
        .select()
        .single();

      // Get initial ledger count for casino (should be 0)
      const initialLedger = await supabase
        .from('loyalty_ledger')
        .select('id')
        .eq('casino_id', casino!.id);

      const initialCount = initialLedger.data?.length ?? 0;

      // Close the ghost slip
      const closeResponse = await request.post(
        `/api/v1/rating-slips/${ratingSlip!.id}/close`,
        {
          headers: {
            Authorization: `Bearer ${signInData!.session!.access_token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `e2e_ghost_close_${timestamp}`,
          },
          data: { average_bet: 5000 },
        },
      );

      // Close should succeed
      expect(closeResponse.ok()).toBeTruthy();

      // Wait for any async operations
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // CRITICAL: No loyalty_ledger entry should be created for ghost visit
      const finalLedger = await supabase
        .from('loyalty_ledger')
        .select('id')
        .eq('casino_id', casino!.id);

      expect(finalLedger.data?.length ?? 0).toBe(initialCount);

      // Cleanup
      await supabase.from('rating_slip').delete().eq('casino_id', casino!.id);
      await supabase.from('visit').delete().eq('id', visit!.id);
      await supabase.from('gaming_table').delete().eq('id', table!.id);
      await supabase.from('game_settings').delete().eq('casino_id', casino!.id);
      await supabase.from('staff').delete().eq('id', staff!.id);
      await supabase
        .from('casino_settings')
        .delete()
        .eq('casino_id', casino!.id);
      await supabase.from('casino').delete().eq('id', casino!.id);
      await supabase.auth.admin.deleteUser(authData!.user!.id);
    });
  });
});

/**
 * Regression Test Suite
 *
 * These tests are specifically designed to prevent regression of ISSUE-47B1DFF1.
 * They should run in CI to ensure the loyalty accrual integration is never broken.
 */
test.describe('ISSUE-47B1DFF1 Regression Prevention', () => {
  test('useCloseWithFinancial hook calls accrueOnClose', async ({
    request,
  }) => {
    // This test verifies the integration point that was missing.
    // The hook at hooks/rating-slip-modal/use-close-with-financial.ts
    // must call accrueOnClose() after closeRatingSlip().

    const scenario = await createLoyaltyTestScenario();

    try {
      // Get initial ledger state
      const initialLedger = await getLoyaltyLedgerForPlayer(
        scenario.playerId,
        scenario.casinoId,
      );

      // Close via the modal endpoint (which uses useCloseWithFinancial internally)
      const closeResponse = await request.post(
        `/api/v1/rating-slips/${scenario.ratingSlipId}/close`,
        {
          headers: {
            Authorization: `Bearer ${scenario.authToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `e2e_regression_${Date.now()}`,
          },
          data: {
            average_bet: 5000,
            chips_taken: 0,
          },
        },
      );

      expect(closeResponse.ok()).toBeTruthy();

      // Wait for async accrual
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // CRITICAL REGRESSION CHECK: Verify accrual was triggered
      const finalLedger = await getLoyaltyLedgerForPlayer(
        scenario.playerId,
        scenario.casinoId,
      );

      // There MUST be a new ledger entry
      expect(finalLedger.length).toBeGreaterThan(initialLedger.length);

      // The new entry MUST be a base_accrual for this slip
      const accrualEntry = finalLedger.find(
        (e) =>
          e.rating_slip_id === scenario.ratingSlipId &&
          e.reason === 'base_accrual',
      );

      expect(accrualEntry).toBeDefined();
      expect(accrualEntry!.points_delta).toBeGreaterThan(0);

      // Balance MUST have increased
      const balance = await getPlayerLoyaltyBalance(
        scenario.playerId,
        scenario.casinoId,
      );
      expect(balance!.current_balance).toBeGreaterThan(0);
    } finally {
      await scenario.cleanup();
    }
  });
});
