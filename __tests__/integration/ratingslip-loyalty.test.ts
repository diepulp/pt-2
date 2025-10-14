/**
 * RatingSlip → Loyalty Integration Test Suite
 * Phase 6 Wave 3 - Track 0: Integration Testing
 *
 * Purpose: Validate end-to-end workflows for RatingSlip completion and Loyalty accrual
 * - Happy path: completeRatingSlip creates ledger entry and updates tier
 * - Idempotency: duplicate completion attempts handled gracefully
 * - Manual rewards: staff actions with rate limiting
 * - Performance: <500ms requirement validation
 * - Recovery: partial completion scenarios
 * - Concurrency: race condition handling with row locking
 * - Edge cases: date bucketing for idempotency
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  completeRatingSlip,
  recoverSlipLoyalty,
} from '@/app/actions/ratingslip-actions';
import { manualReward } from '@/app/actions/loyalty-actions';
import { resetRateLimit } from '@/lib/rate-limiter';
import { createCasinoService } from '@/services/casino';
import { createPlayerService } from '@/services/player';
import { createVisitService } from '@/services/visit';
import { createRatingSlipCrudService } from '@/services/ratingslip/crud';
import { createTableContextService } from '@/services/table-context';
import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Test data cleanup helpers
const testDataIds: {
  casinos: string[];
  players: string[];
  visits: string[];
  ratingSlips: string[];
  gamingTables: string[];
  staff: string[];
} = {
  casinos: [],
  players: [],
  visits: [],
  ratingSlips: [],
  gamingTables: [],
  staff: [],
};

// ============================================================================
// Test Suite Setup & Teardown
// ============================================================================

describe('RatingSlip → Loyalty Integration Tests', () => {
  let supabase: SupabaseClient<Database>;

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
  });

  afterEach(() => {
    // Clean up tracked IDs
    testDataIds.casinos = [];
    testDataIds.players = [];
    testDataIds.visits = [];
    testDataIds.ratingSlips = [];
    testDataIds.gamingTables = [];
    testDataIds.staff = [];
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Create a complete test scenario with casino, player, visit, and gaming table
   */
  async function createTestScenario() {
    const casinoService = createCasinoService(supabase);
    const playerService = createPlayerService(supabase);
    const visitService = createVisitService(supabase);
    const tableService = createTableContextService(supabase);

    // Create casino
    const casinoResult = await casinoService.create({
      name: `Integration Test Casino ${Date.now()}`,
      location: 'Test Location',
    });
    const casinoId = casinoResult.data!.id;
    testDataIds.casinos.push(casinoId);

    // Create player with loyalty balance initialized
    const playerResult = await playerService.create({
      email: `integration-test-${Date.now()}@example.com`,
      firstName: 'Integration',
      lastName: 'Test',
    });
    const playerId = playerResult.data!.id;
    testDataIds.players.push(playerId);

    // Initialize player loyalty balance
    await supabase.from('player_loyalty_balance').insert({
      player_id: playerId,
      current_balance: 0,
      lifetime_points: 0,
      tier: 'BRONZE',
    });

    // Create gaming table
    const tableResult = await tableService.create({
      casinoId,
      name: `Test Table ${Date.now()}`,
      tableNumber: `T-${Date.now()}`,
      type: 'BLACKJACK',
    });
    const tableId = tableResult.data!.id;
    testDataIds.gamingTables.push(tableId);

    // Create visit
    const visitResult = await visitService.create({
      casinoId,
      playerId,
      checkInDate: new Date().toISOString(),
    });
    const visitId = visitResult.data!.id;
    testDataIds.visits.push(visitId);

    return { casinoId, playerId, visitId, tableId };
  }

  /**
   * Create a rating slip for testing
   */
  async function createTestRatingSlip(
    playerId: string,
    visitId: string,
    tableId: string,
  ) {
    const ratingSlipService = createRatingSlipCrudService(supabase);

    const result = await ratingSlipService.create({
      playerId,
      visitId,
      gamingTableId: tableId,
      averageBet: 50,
      startTime: new Date().toISOString(),
      gameSettings: {
        house_edge: 0.05,
        average_rounds_per_hour: 60,
        point_multiplier: 1.0,
        points_conversion_rate: 0.01,
        seats_available: 6,
        name: 'Blackjack',
      },
    });

    const slipId = result.data!.id;
    testDataIds.ratingSlips.push(slipId);

    // Simulate gameplay duration
    await supabase
      .from('ratingslip')
      .update({ accumulated_seconds: 3600 }) // 1 hour
      .eq('id', slipId);

    return slipId;
  }

  /**
   * Create a test staff member for manual rewards
   */
  async function createTestStaff() {
    const staffResult = await supabase
      .from('Staff')
      .insert({
        firstName: 'Test',
        lastName: 'Staff',
        email: `staff-${Date.now()}@test.com`,
        role: 'MANAGER',
        updatedAt: new Date().toISOString(),
      })
      .select('id')
      .single();

    const staffId = staffResult.data!.id;
    testDataIds.staff.push(staffId);

    // Create staff permissions with loyalty:award capability
    await supabase.from('staff_permissions').insert({
      staff_id: staffId,
      capabilities: ['loyalty:award'],
    });

    return staffId;
  }

  // ============================================================================
  // Test 1: Happy Path - Complete RatingSlip
  // ============================================================================

  it('completeRatingSlip creates ledger entry and updates tier', async () => {
    const { playerId, visitId, tableId } = await createTestScenario();
    const slipId = await createTestRatingSlip(playerId, visitId, tableId);

    // Get initial balance
    const { data: initialBalance } = await supabase
      .from('player_loyalty_balance')
      .select('*')
      .eq('player_id', playerId)
      .single();

    expect(initialBalance?.current_balance).toBe(0);
    expect(initialBalance?.tier).toBe('BRONZE');

    // Complete the rating slip
    const result = await completeRatingSlip(slipId);

    // Verify success
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.ratingSlip.id).toBe(slipId);
    expect(result.data?.loyalty).toBeDefined();
    expect(result.data?.loyalty.pointsEarned).toBeGreaterThan(0);

    // Verify ledger entry created
    const { data: ledgerEntry } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('rating_slip_id', slipId)
      .eq('transaction_type', 'GAMEPLAY')
      .single();

    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry?.player_id).toBe(playerId);
    expect(ledgerEntry?.points_change).toBeGreaterThan(0);
    expect(ledgerEntry?.balance_before).toBe(0);
    expect(ledgerEntry?.balance_after).toBe(ledgerEntry?.points_change);
    expect(ledgerEntry?.tier_before).toBe('BRONZE');

    // Verify balance updated
    const { data: updatedBalance } = await supabase
      .from('player_loyalty_balance')
      .select('*')
      .eq('player_id', playerId)
      .single();

    expect(updatedBalance?.current_balance).toBe(ledgerEntry?.points_change);
    expect(updatedBalance?.lifetime_points).toBe(ledgerEntry?.points_change);
  });

  // ============================================================================
  // Test 2: Idempotency - Duplicate Completion
  // ============================================================================

  it('duplicate completeRatingSlip returns same result', async () => {
    const { playerId, visitId, tableId } = await createTestScenario();
    const slipId = await createTestRatingSlip(playerId, visitId, tableId);

    // First completion
    const firstResult = await completeRatingSlip(slipId);
    expect(firstResult.success).toBe(true);

    const firstPoints = firstResult.data?.loyalty.pointsEarned;
    const firstBalance = firstResult.data?.loyalty.newBalance;

    // Second attempt (should fail with INVALID_STATE since slip is already CLOSED)
    const secondResult = await completeRatingSlip(slipId);
    expect(secondResult.success).toBe(false);
    expect(secondResult.error?.code).toBe('INVALID_STATE');
    expect(secondResult.error?.message).toContain('already closed');

    // Verify only ONE ledger entry exists
    const { data: ledgerEntries } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('rating_slip_id', slipId)
      .eq('transaction_type', 'GAMEPLAY');

    expect(ledgerEntries?.length).toBe(1);

    // Verify balance unchanged
    const { data: balance } = await supabase
      .from('player_loyalty_balance')
      .select('*')
      .eq('player_id', playerId)
      .single();

    expect(balance?.current_balance).toBe(firstBalance);
  });

  // ============================================================================
  // Test 3: Manual Reward - Staff Action
  // ============================================================================

  it('manualReward creates MANUAL_BONUS ledger entry', async () => {
    const { playerId } = await createTestScenario();
    const staffId = await createTestStaff();

    // Reset rate limit for staff
    resetRateLimit(staffId);

    // Mock session for staff
    jest
      .spyOn(require('@/lib/supabase/server'), 'createClient')
      .mockResolvedValue({
        ...supabase,
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: staffId } } },
          }),
        },
      });

    const result = await manualReward({
      playerId,
      pointsChange: 100,
      reason: 'Birthday bonus',
      sequence: 1,
    });

    // Verify success
    expect(result.success).toBe(true);
    expect(result.data?.pointsChange).toBe(100);

    // Verify ledger entry with MANUAL_BONUS
    const { data: ledgerEntry } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('player_id', playerId)
      .eq('transaction_type', 'MANUAL_BONUS')
      .single();

    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry?.staff_id).toBe(staffId);
    expect(ledgerEntry?.points_change).toBe(100);
    expect(ledgerEntry?.balance_after).toBe(
      (ledgerEntry?.balance_before ?? 0) + 100,
    );

    // Verify balance updated
    const { data: balance } = await supabase
      .from('player_loyalty_balance')
      .select('*')
      .eq('player_id', playerId)
      .single();

    expect(balance?.current_balance).toBe(ledgerEntry?.balance_after);
  });

  // ============================================================================
  // Test 4: Rate Limiting - Manual Reward Enforcement
  // ============================================================================

  it('manualReward enforces 10 requests/min limit', async () => {
    const { playerId } = await createTestScenario();
    const staffId = await createTestStaff();

    // Reset rate limit
    resetRateLimit(staffId);

    // Mock session
    jest
      .spyOn(require('@/lib/supabase/server'), 'createClient')
      .mockResolvedValue({
        ...supabase,
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: staffId } } },
          }),
        },
      });

    // Exhaust rate limit (10 requests)
    for (let i = 0; i < 10; i++) {
      const result = await manualReward({
        playerId,
        pointsChange: 10,
        reason: `Bonus ${i}`,
        sequence: i,
      });
      expect(result.success).toBe(true);
    }

    // 11th request should be rate limited
    const result = await manualReward({
      playerId,
      pointsChange: 10,
      reason: 'Bonus 11',
      sequence: 11,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(429);
    expect(result.error?.code).toBe('RATE_LIMIT_EXCEEDED');
  }, 30000); // Increase timeout for rate limiting test

  // ============================================================================
  // Test 5: Performance - <500ms Requirement
  // ============================================================================

  it('completeRatingSlip completes in <500ms', async () => {
    const { playerId, visitId, tableId } = await createTestScenario();
    const slipId = await createTestRatingSlip(playerId, visitId, tableId);

    // Measure performance
    const startTime = Date.now();
    const result = await completeRatingSlip(slipId);
    const duration = Date.now() - startTime;

    // Verify success
    expect(result.success).toBe(true);

    // Verify performance requirement
    expect(duration).toBeLessThan(500);

    console.log(`✅ Performance: completeRatingSlip completed in ${duration}ms`);
  });

  // ============================================================================
  // Test 6: Saga Recovery - Partial Completion
  // ============================================================================

  it('recoverSlipLoyalty handles partial completion', async () => {
    const { playerId, visitId, tableId } = await createTestScenario();
    const slipId = await createTestRatingSlip(playerId, visitId, tableId);

    // Manually close the slip without loyalty accrual to simulate partial completion
    await supabase.rpc('close_player_session', {
      p_rating_slip_id: slipId,
      p_visit_id: visitId,
      p_chips_taken: 0,
      p_end_time: new Date().toISOString(),
    });

    // Verify slip is CLOSED
    const { data: closedSlip } = await supabase
      .from('ratingslip')
      .select('status')
      .eq('id', slipId)
      .single();

    expect(closedSlip?.status).toBe('CLOSED');

    // Attempt recovery
    const correlationId = `recovery-${Date.now()}`;
    const recoveryResult = await recoverSlipLoyalty(slipId, correlationId);

    // Verify recovery success
    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.data?.pointsEarned).toBeGreaterThan(0);

    // Verify ledger entry created
    const { data: ledgerEntry } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('rating_slip_id', slipId)
      .eq('transaction_type', 'GAMEPLAY')
      .single();

    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry?.correlation_id).toBe(correlationId);

    // Attempt recovery again (should be idempotent)
    const secondRecovery = await recoverSlipLoyalty(slipId, correlationId);
    expect(secondRecovery.success).toBe(true);
    expect(secondRecovery.data?.pointsEarned).toBe(
      recoveryResult.data?.pointsEarned,
    );

    // Verify still only ONE ledger entry
    const { data: allEntries } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('rating_slip_id', slipId);

    expect(allEntries?.length).toBe(1);
  });

  // ============================================================================
  // Test 7: Concurrency - Race Conditions
  // ============================================================================

  it('concurrent operations maintain balance integrity', async () => {
    const { playerId, visitId, tableId } = await createTestScenario();
    const staffId = await createTestStaff();

    // Create rating slip
    const slipId = await createTestRatingSlip(playerId, visitId, tableId);

    // Reset rate limit
    resetRateLimit(staffId);

    // Mock session
    jest
      .spyOn(require('@/lib/supabase/server'), 'createClient')
      .mockResolvedValue({
        ...supabase,
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: staffId } } },
          }),
        },
      });

    // Start concurrent operations
    const [slipResult, manualResult] = await Promise.all([
      completeRatingSlip(slipId),
      manualReward({
        playerId,
        pointsChange: 50,
        reason: 'Concurrent bonus',
        sequence: 1,
      }),
    ]);

    // Both should succeed
    expect(slipResult.success).toBe(true);
    expect(manualResult.success).toBe(true);

    const slipPoints = slipResult.data?.loyalty.pointsEarned ?? 0;
    const manualPoints = manualResult.data?.pointsChange ?? 0;

    // Verify final balance is sum of both operations
    const { data: finalBalance } = await supabase
      .from('player_loyalty_balance')
      .select('*')
      .eq('player_id', playerId)
      .single();

    expect(finalBalance?.current_balance).toBe(slipPoints + manualPoints);

    // Verify both ledger entries exist
    const { data: ledgerEntries } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: true });

    expect(ledgerEntries?.length).toBe(2);
  });

  // ============================================================================
  // Test 8: Idempotency Edge Case - Date Bucketing
  // ============================================================================

  it('manual reward idempotency uses date bucketing', async () => {
    const { playerId } = await createTestScenario();
    const staffId = await createTestStaff();

    // Reset rate limit
    resetRateLimit(staffId);

    // Mock session
    jest
      .spyOn(require('@/lib/supabase/server'), 'createClient')
      .mockResolvedValue({
        ...supabase,
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: staffId } } },
          }),
        },
      });

    // Issue first reward
    const firstResult = await manualReward({
      playerId,
      pointsChange: 100,
      reason: 'Test reward',
      sequence: 1,
    });

    expect(firstResult.success).toBe(true);

    // Issue duplicate within same day (should be idempotent)
    const duplicateResult = await manualReward({
      playerId,
      pointsChange: 100,
      reason: 'Test reward',
      sequence: 1,
    });

    expect(duplicateResult.success).toBe(true);

    // Verify only ONE ledger entry for the duplicate
    const { data: todayEntries } = await supabase
      .from('loyalty_ledger')
      .select('*')
      .eq('player_id', playerId)
      .eq('transaction_type', 'MANUAL_BONUS')
      .eq('staff_id', staffId);

    // Should have only 1 entry due to idempotency
    expect(todayEntries?.length).toBe(1);

    // Verify balance reflects single operation
    const { data: balance } = await supabase
      .from('player_loyalty_balance')
      .select('*')
      .eq('player_id', playerId)
      .single();

    expect(balance?.current_balance).toBe(100);
  });
});
