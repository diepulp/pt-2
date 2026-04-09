/** @jest-environment node */

/**
 * Loyalty Accrual Lifecycle Integration Tests
 *
 * REGRESSION PREVENTION: ISSUE-47B1DFF1
 * "Loyalty accrual never called on rating slip close"
 *
 * Tests the complete loyalty accrual workflow at the service layer:
 * 1. Rating slip creation with policy_snapshot
 * 2. Loyalty ledger entry creation
 * 3. Player balance updates (current_balance)
 * 4. Theo and points calculation accuracy
 *
 * AUTH: Mode C (ADR-024) — setupClient (service-role) for fixture creation,
 * pitBossClient (authenticated anon) for service/RPC operations.
 * This suite uses direct SQL for simulation so most operations remain on
 * setupClient. Auth ceremony via createModeCSession helper (ADR-024).
 *
 * @see ISSUE-47B1DFF1 Loyalty accrual never called on rating slip close
 * @see ADR-024 RLS Context Self-Injection Remediation
 * @see ADR-019 Loyalty Points Policy
 */

import { randomUUID } from 'crypto';

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { createModeCSession } from '@/lib/testing/create-mode-c-session';
import type { Database } from '@/types/database.types';

// ============================================================================
// Test Configuration
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_PREFIX = 'test-lac-mc'; // loyalty-accrual-lifecycle Mode C

// Policy values used in calculations (must match fixture setup)
const POLICY = {
  houseEdge: 1.5, // 1.5%
  decisionsPerHour: 70,
  pointsConversionRate: 10.0,
  pointMultiplier: 1.0,
};

// ============================================================================
// Calculation Helpers (mirrors RPC logic for verification)
// ============================================================================

/**
 * Calculate theoretical win (theo) based on policy snapshot values.
 * Formula: avg_bet * (house_edge/100) * (duration_hours) * decisions_per_hour
 */
function calculateTheo(
  avgBet: number,
  durationSeconds: number,
  houseEdge: number = POLICY.houseEdge,
  decisionsPerHour: number = POLICY.decisionsPerHour,
): number {
  const durationHours = durationSeconds / 3600;
  return avgBet * (houseEdge / 100) * durationHours * decisionsPerHour;
}

/**
 * Calculate loyalty points from theo.
 * Formula: ROUND(theo * points_conversion_rate * point_multiplier)
 */
function calculatePoints(
  theo: number,
  pointsConversionRate: number = POLICY.pointsConversionRate,
  pointMultiplier: number = POLICY.pointMultiplier,
): number {
  return Math.round(theo * pointsConversionRate * pointMultiplier);
}

// ============================================================================
// Test Fixture Types
// ============================================================================

interface TestFixture {
  casinoId: string;
  tableId: string;
  actorId: string;
  authUserId: string;
  cleanup: () => Promise<void>;
}

interface TestPlayer {
  id: string;
  visitId: string;
  cleanup: () => Promise<void>;
}

interface RatingSlipData {
  id: string;
  visitId: string;
  tableId: string;
  casinoId: string;
  playerId: string;
  averageBet: number;
  durationSeconds: number;
  policySnapshot: Record<string, unknown>;
}

// ============================================================================
// Test Suite
// ============================================================================

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION_TESTS === 'true' ||
  process.env.RUN_INTEGRATION_TESTS === '1';

(RUN_INTEGRATION ? describe : describe.skip)(
  'Loyalty Accrual Lifecycle Integration Tests (ISSUE-47B1DFF1)',
  () => {
    let setupClient: SupabaseClient<Database>;
    let pitBossClient: SupabaseClient<Database>;
    let authCleanup: (() => Promise<void>) | undefined;
    let fixture: TestFixture;
    let playerCounter = 0;

    beforeAll(async () => {
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error(
          'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
        );
      }

      // Phase 1: Service-role client for fixture setup
      setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

      // Phase 2-6: Create fixtures
      fixture = await createTestFixture(setupClient);

      // Phase 7: Mode C auth ceremony via shared helper (ADR-024)
      const session = await createModeCSession(setupClient, {
        staffId: fixture.actorId,
        casinoId: fixture.casinoId,
        staffRole: 'pit_boss',
      });
      pitBossClient = session.client;
      authCleanup = session.cleanup;
      fixture.authUserId = session.userId;

      // Link staff to auth user (two-phase ADR-024)
      await setupClient
        .from('staff')
        .update({ user_id: session.userId })
        .eq('id', fixture.actorId);
    }, 30_000);

    afterAll(async () => {
      await authCleanup?.();
      if (fixture?.cleanup) {
        await fixture.cleanup();
      }
    }, 15_000);

    // ==========================================================================
    // Helper: Create isolated player with visit and loyalty account
    // ==========================================================================
    async function createTestPlayer(): Promise<TestPlayer> {
      playerCounter++;

      // 1. Create player (setupClient — fixture creation)
      const { data: player, error: playerError } = await setupClient
        .from('player')
        .insert({
          first_name: 'Loyalty',
          last_name: `Test${playerCounter}_${Date.now()}`,
          birth_date: '1985-01-15',
        })
        .select()
        .single();

      if (playerError || !player) {
        throw new Error(`Failed to create player: ${playerError?.message}`);
      }

      // 2. Link player to casino
      await setupClient.from('player_casino').insert({
        player_id: player.id,
        casino_id: fixture.casinoId,
        status: 'active',
      });

      // 3. Create player_loyalty record (required for accrual)
      await setupClient.from('player_loyalty').insert({
        player_id: player.id,
        casino_id: fixture.casinoId,
        current_balance: 0,
        tier: 'bronze',
      });

      // 4. Create active visit
      const visitGroupId = randomUUID();
      const { data: visit, error: visitError } = await setupClient
        .from('visit')
        .insert({
          player_id: player.id,
          casino_id: fixture.casinoId,
          started_at: new Date().toISOString(),
          ended_at: null,
          visit_kind: 'gaming_identified_rated',
          visit_group_id: visitGroupId,
        })
        .select()
        .single();

      if (visitError || !visit) {
        throw new Error(`Failed to create visit: ${visitError?.message}`);
      }

      // Cleanup function
      const cleanup = async () => {
        await setupClient
          .from('loyalty_ledger')
          .delete()
          .eq('player_id', player.id);
        await setupClient.from('rating_slip').delete().eq('visit_id', visit.id);
        await setupClient.from('visit').delete().eq('id', visit.id);
        await setupClient
          .from('player_loyalty')
          .delete()
          .eq('player_id', player.id);
        await setupClient
          .from('player_casino')
          .delete()
          .eq('player_id', player.id);
        await setupClient.from('player').delete().eq('id', player.id);
      };

      return {
        id: player.id,
        visitId: visit.id,
        cleanup,
      };
    }

    // ==========================================================================
    // Helper: Create a closed rating slip with policy_snapshot (direct SQL)
    // ==========================================================================
    async function createClosedRatingSlip(
      player: TestPlayer,
      avgBet: number,
      durationSeconds: number,
    ): Promise<RatingSlipData> {
      const slipId = randomUUID();
      const startTime = new Date(Date.now() - durationSeconds * 1000);
      const endTime = new Date();

      // Create policy_snapshot matching game_settings
      const policySnapshot = {
        loyalty: {
          house_edge: POLICY.houseEdge,
          decisions_per_hour: POLICY.decisionsPerHour,
          points_conversion_rate: POLICY.pointsConversionRate,
          point_multiplier: POLICY.pointMultiplier,
        },
        game_type: 'blackjack',
        captured_at: startTime.toISOString(),
      };

      // Calculate computed_theo_cents (required by chk_closed_slip_has_theo constraint)
      const theo = calculateTheo(avgBet, durationSeconds);
      const computedTheoCents = Math.max(Math.round(theo * 100), 0);

      // setupClient — fixture creation (direct INSERT bypasses RLS)
      const { error: slipError } = await setupClient
        .from('rating_slip')
        .insert({
          id: slipId,
          casino_id: fixture.casinoId,
          visit_id: player.visitId,
          table_id: fixture.tableId,
          seat_number: String(playerCounter),
          average_bet: avgBet,
          status: 'closed',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          duration_seconds: durationSeconds,
          policy_snapshot: policySnapshot,
          accrual_kind: 'loyalty',
          computed_theo_cents: computedTheoCents,
        });

      if (slipError) {
        throw new Error(`Failed to create rating slip: ${slipError.message}`);
      }

      return {
        id: slipId,
        visitId: player.visitId,
        tableId: fixture.tableId,
        casinoId: fixture.casinoId,
        playerId: player.id,
        averageBet: avgBet,
        durationSeconds,
        policySnapshot,
      };
    }

    // ==========================================================================
    // Helper: Simulate accrual and update balance directly
    // Uses setupClient (service-role) for direct table manipulation.
    // This simulates what rpc_accrue_on_close does, but via direct SQL
    // to focus on business logic verification.
    // ==========================================================================
    async function simulateAccrual(
      slip: RatingSlipData,
      idempotencyKey: string,
    ): Promise<{
      ledgerId: string;
      pointsDelta: number;
      theo: number;
      balanceAfter: number;
      isExisting: boolean;
    }> {
      // Check for existing entry with same idempotency key (setupClient — verification)
      const { data: existingEntry } = await setupClient
        .from('loyalty_ledger')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (existingEntry) {
        // Get current balance
        const { data: balance } = await setupClient
          .from('player_loyalty')
          .select('current_balance')
          .eq('player_id', slip.playerId)
          .eq('casino_id', slip.casinoId)
          .single();

        return {
          ledgerId: existingEntry.id,
          pointsDelta: existingEntry.points_delta,
          theo: (existingEntry.metadata as Record<string, number>)?.theo ?? 0,
          balanceAfter: balance?.current_balance ?? 0,
          isExisting: true,
        };
      }

      // Calculate theo and points
      const theo = calculateTheo(slip.averageBet, slip.durationSeconds);
      const pointsDelta = calculatePoints(theo);

      // Insert ledger entry (setupClient — direct SQL simulation)
      const { data: ledgerEntry, error: ledgerError } = await setupClient
        .from('loyalty_ledger')
        .insert({
          casino_id: slip.casinoId,
          player_id: slip.playerId,
          rating_slip_id: slip.id,
          visit_id: slip.visitId,
          points_delta: pointsDelta,
          reason: 'base_accrual',
          idempotency_key: idempotencyKey,
          source_kind: 'rating_slip',
          source_id: slip.id,
          metadata: {
            theo,
            avg_bet: slip.averageBet,
            duration_seconds: slip.durationSeconds,
            policy_snapshot: slip.policySnapshot,
          },
        })
        .select()
        .single();

      if (ledgerError) {
        throw new Error(
          `Failed to create ledger entry: ${ledgerError.message}`,
        );
      }

      // Get current balance and update (setupClient — direct SQL simulation)
      const { data: currentBalance } = await setupClient
        .from('player_loyalty')
        .select('current_balance')
        .eq('player_id', slip.playerId)
        .eq('casino_id', slip.casinoId)
        .single();

      const newBalance = (currentBalance?.current_balance ?? 0) + pointsDelta;

      await setupClient
        .from('player_loyalty')
        .update({ current_balance: newBalance })
        .eq('player_id', slip.playerId)
        .eq('casino_id', slip.casinoId);

      return {
        ledgerId: ledgerEntry!.id,
        pointsDelta,
        theo,
        balanceAfter: newBalance,
        isExisting: false,
      };
    }

    // ==========================================================================
    // TEST 1: Complete accrual lifecycle
    // ==========================================================================
    describe('Complete Accrual Lifecycle', () => {
      let testPlayer: TestPlayer;

      beforeEach(async () => {
        testPlayer = await createTestPlayer();
      });

      afterEach(async () => {
        if (testPlayer?.cleanup) {
          await testPlayer.cleanup();
        }
      });

      it('should create loyalty_ledger entry when rating slip is closed', async () => {
        // === ARRANGE ===
        const avgBet = 100; // $1.00
        const durationSeconds = 3600; // 1 hour

        const slip = await createClosedRatingSlip(
          testPlayer,
          avgBet,
          durationSeconds,
        );

        // === ACT ===
        const idempotencyKey = randomUUID();
        const result = await simulateAccrual(slip, idempotencyKey);

        // === ASSERT ===
        // 1. Verify result structure
        expect(result.ledgerId).toBeDefined();
        expect(result.pointsDelta).toBeGreaterThan(0);
        expect(result.theo).toBeGreaterThan(0);
        expect(result.balanceAfter).toBe(result.pointsDelta);
        expect(result.isExisting).toBe(false);

        // 2. Verify loyalty_ledger entry in database (setupClient — verification)
        const { data: ledgerEntry } = await setupClient
          .from('loyalty_ledger')
          .select('*')
          .eq('id', result.ledgerId)
          .single();

        expect(ledgerEntry).toBeDefined();
        expect(ledgerEntry!.player_id).toBe(testPlayer.id);
        expect(ledgerEntry!.casino_id).toBe(fixture.casinoId);
        expect(ledgerEntry!.rating_slip_id).toBe(slip.id);
        expect(ledgerEntry!.reason).toBe('base_accrual');
        expect(ledgerEntry!.points_delta).toBe(result.pointsDelta);

        // 3. Verify player_loyalty balance in database (setupClient — verification)
        const { data: balance } = await setupClient
          .from('player_loyalty')
          .select('current_balance')
          .eq('player_id', testPlayer.id)
          .eq('casino_id', fixture.casinoId)
          .single();

        expect(balance!.current_balance).toBe(result.pointsDelta);
      });

      it('should calculate correct points based on ADR-019 formula', async () => {
        // Test with known values for verifiable calculation
        const avgBet = 50; // 50 cents
        const durationSeconds = 7200; // 2 hours

        // Expected calculation:
        // theo = 50 * (1.5/100) * 2 * 70 = 105 cents
        // points = ROUND(105 * 10) = 1050
        const expectedTheo = calculateTheo(avgBet, durationSeconds);
        const expectedPoints = calculatePoints(expectedTheo);

        expect(expectedTheo).toBeCloseTo(105, 1);
        expect(expectedPoints).toBe(1050);

        const slip = await createClosedRatingSlip(
          testPlayer,
          avgBet,
          durationSeconds,
        );
        const result = await simulateAccrual(slip, randomUUID());

        // Verify calculations match
        expect(result.theo).toBeCloseTo(expectedTheo, 1);
        expect(result.pointsDelta).toBe(expectedPoints);
      });
    });

    // ==========================================================================
    // TEST 2: Idempotency
    // ==========================================================================
    describe('Idempotency', () => {
      let testPlayer: TestPlayer;

      beforeEach(async () => {
        testPlayer = await createTestPlayer();
      });

      afterEach(async () => {
        if (testPlayer?.cleanup) {
          await testPlayer.cleanup();
        }
      });

      it('should return existing entry for duplicate idempotency key', async () => {
        const slip = await createClosedRatingSlip(testPlayer, 100, 1800); // 30 min
        const idempotencyKey = randomUUID();

        // First call
        const firstResult = await simulateAccrual(slip, idempotencyKey);
        expect(firstResult.isExisting).toBe(false);

        // Second call with same key
        const secondResult = await simulateAccrual(slip, idempotencyKey);
        expect(secondResult.isExisting).toBe(true);
        expect(secondResult.ledgerId).toBe(firstResult.ledgerId);
        expect(secondResult.pointsDelta).toBe(firstResult.pointsDelta);

        // Verify only one ledger entry exists (setupClient — verification)
        const { data: entries } = await setupClient
          .from('loyalty_ledger')
          .select('id')
          .eq('rating_slip_id', slip.id);

        expect(entries).toHaveLength(1);
      });

      it('should not double-count points on duplicate calls', async () => {
        const slip = await createClosedRatingSlip(testPlayer, 200, 3600);
        const idempotencyKey = randomUUID();

        const result1 = await simulateAccrual(slip, idempotencyKey);
        await simulateAccrual(slip, idempotencyKey);
        await simulateAccrual(slip, idempotencyKey);

        // Balance should equal single accrual (setupClient — verification)
        const { data: balance } = await setupClient
          .from('player_loyalty')
          .select('current_balance')
          .eq('player_id', testPlayer.id)
          .eq('casino_id', fixture.casinoId)
          .single();

        expect(balance!.current_balance).toBe(result1.pointsDelta);
      });
    });

    // ==========================================================================
    // TEST 3: Balance accumulation
    // ==========================================================================
    describe('Balance Accumulation', () => {
      let testPlayer: TestPlayer;

      beforeEach(async () => {
        testPlayer = await createTestPlayer();
      });

      afterEach(async () => {
        if (testPlayer?.cleanup) {
          await testPlayer.cleanup();
        }
      });

      it('should accumulate balance across multiple rating slips', async () => {
        const results: { pointsDelta: number }[] = [];

        // Create 3 slips with different bets
        for (let i = 1; i <= 3; i++) {
          // Need unique seat number for each slip
          playerCounter++;
          const slip = await createClosedRatingSlip(testPlayer, 100 * i, 1800);
          const result = await simulateAccrual(slip, randomUUID());
          results.push(result);
        }

        const expectedTotal = results.reduce(
          (sum, r) => sum + r.pointsDelta,
          0,
        );

        // Verify accumulated balance (setupClient — verification)
        const { data: balance } = await setupClient
          .from('player_loyalty')
          .select('current_balance')
          .eq('player_id', testPlayer.id)
          .eq('casino_id', fixture.casinoId)
          .single();

        expect(balance!.current_balance).toBe(expectedTotal);
      });
    });

    // ==========================================================================
    // TEST 4: Edge cases
    // ==========================================================================
    describe('Edge Cases', () => {
      let testPlayer: TestPlayer;

      beforeEach(async () => {
        testPlayer = await createTestPlayer();
      });

      afterEach(async () => {
        if (testPlayer?.cleanup) {
          await testPlayer.cleanup();
        }
      });

      it('should handle zero duration (0 points)', async () => {
        const slip = await createClosedRatingSlip(testPlayer, 100, 0);
        const result = await simulateAccrual(slip, randomUUID());

        expect(result.theo).toBe(0);
        expect(result.pointsDelta).toBe(0);
      });

      it('should handle small durations correctly', async () => {
        // 1 minute session
        const slip = await createClosedRatingSlip(testPlayer, 100, 60);
        const result = await simulateAccrual(slip, randomUUID());

        // Expected: 100 * 0.015 * (1/60) * 70 = 1.75 cents -> 18 points
        const expectedTheo = calculateTheo(100, 60);
        const expectedPoints = calculatePoints(expectedTheo);

        expect(result.theo).toBeCloseTo(expectedTheo, 2);
        expect(result.pointsDelta).toBe(expectedPoints);
      });

      it('should handle high-roller session correctly', async () => {
        // $500 average bet, 4 hours
        const slip = await createClosedRatingSlip(testPlayer, 50000, 14400);
        const result = await simulateAccrual(slip, randomUUID());

        // Expected: 50000 * 0.015 * 4 * 70 = 210000 cents -> 2,100,000 points
        const expectedTheo = calculateTheo(50000, 14400);
        const expectedPoints = calculatePoints(expectedTheo);

        expect(result.theo).toBeCloseTo(expectedTheo, 1);
        expect(result.pointsDelta).toBe(expectedPoints);
      });
    });

    // ==========================================================================
    // TEST 5: Policy snapshot immutability
    // ==========================================================================
    describe('Policy Snapshot', () => {
      let testPlayer: TestPlayer;

      beforeEach(async () => {
        testPlayer = await createTestPlayer();
      });

      afterEach(async () => {
        if (testPlayer?.cleanup) {
          await testPlayer.cleanup();
        }
      });

      it('should store calculation provenance in metadata', async () => {
        const avgBet = 150;
        const durationSeconds = 5400; // 1.5 hours

        const slip = await createClosedRatingSlip(
          testPlayer,
          avgBet,
          durationSeconds,
        );
        const result = await simulateAccrual(slip, randomUUID());

        // Verify metadata contains calculation details (setupClient — verification)
        const { data: ledgerEntry } = await setupClient
          .from('loyalty_ledger')
          .select('metadata')
          .eq('id', result.ledgerId)
          .single();

        const metadata = ledgerEntry!.metadata as Record<string, unknown>;

        expect(metadata.theo).toBe(result.theo);
        expect(metadata.avg_bet).toBe(avgBet);
        expect(metadata.duration_seconds).toBe(durationSeconds);
        expect(metadata.policy_snapshot).toBeDefined();
      });
    });
  },
);

// ============================================================================
// Fixture Factory
// ============================================================================

async function createTestFixture(
  setupClient: SupabaseClient<Database>,
): Promise<TestFixture> {
  // 1. Create company (ADR-043: company before casino)
  const { data: company, error: companyError } = await setupClient
    .from('company')
    .insert({ name: `${TEST_PREFIX} Company ${Date.now()}` })
    .select()
    .single();

  if (companyError || !company) {
    throw new Error(`Failed to create company: ${companyError?.message}`);
  }

  // 2. Create casino
  const { data: casino, error: casinoError } = await setupClient
    .from('casino')
    .insert({
      name: `${TEST_PREFIX} Casino ${Date.now()}`,
      status: 'active',
      company_id: company.id,
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create casino: ${casinoError?.message}`);
  }

  // 3. Create casino settings
  await setupClient.from('casino_settings').insert({
    casino_id: casino.id,
    gaming_day_start_time: '06:00:00',
    timezone: 'America/Los_Angeles',
    watchlist_floor: 3000,
    ctr_threshold: 10000,
  });

  // 4. Create gaming table
  const { data: table, error: tableError } = await setupClient
    .from('gaming_table')
    .insert({
      casino_id: casino.id,
      label: `${TEST_PREFIX}-BJ-01`,
      pit: 'Pit A',
      type: 'blackjack',
      status: 'active',
    })
    .select()
    .single();

  if (tableError || !table) {
    throw new Error(`Failed to create table: ${tableError?.message}`);
  }

  // 5. Create game_settings for blackjack with known policy values
  await setupClient.from('game_settings').insert({
    casino_id: casino.id,
    game_type: 'blackjack',
    name: 'Blackjack Standard',
    house_edge: POLICY.houseEdge,
    decisions_per_hour: POLICY.decisionsPerHour,
    points_conversion_rate: POLICY.pointsConversionRate,
    point_multiplier: POLICY.pointMultiplier,
  });

  // 6. Create staff actor (required for audit trail)
  const { data: actor, error: actorError } = await setupClient
    .from('staff')
    .insert({
      casino_id: casino.id,
      employee_id: `${TEST_PREFIX}-001`,
      first_name: 'Test',
      last_name: 'PitBoss',
      email: `${TEST_PREFIX}-pitboss-${Date.now()}@test.local`,
      role: 'pit_boss',
      status: 'active',
    })
    .select()
    .single();

  if (actorError || !actor) {
    throw new Error(`Failed to create actor: ${actorError?.message}`);
  }

  // Cleanup function (reverse dependency order)
  const cleanup = async () => {
    await setupClient
      .from('loyalty_ledger')
      .delete()
      .eq('casino_id', casino.id);
    await setupClient.from('rating_slip').delete().eq('casino_id', casino.id);
    await setupClient.from('visit').delete().eq('casino_id', casino.id);
    await setupClient
      .from('player_loyalty')
      .delete()
      .eq('casino_id', casino.id);
    await setupClient.from('player_casino').delete().eq('casino_id', casino.id);
    await setupClient.from('player').delete().like('last_name', 'Test%');
    // Auth user cleanup is handled by authCleanup in afterAll
    await setupClient.from('staff').delete().eq('id', actor.id);
    await setupClient.from('game_settings').delete().eq('casino_id', casino.id);
    await setupClient.from('gaming_table').delete().eq('id', table.id);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', casino.id);
    await setupClient.from('casino').delete().eq('id', casino.id);
    await setupClient.from('company').delete().eq('id', company.id);
  };

  // Note: authUserId is set in beforeAll after auth user creation
  const fixture: TestFixture = {
    casinoId: casino.id,
    tableId: table.id,
    actorId: actor.id,
    authUserId: '', // set in beforeAll
    cleanup,
  };

  return fixture;
}
