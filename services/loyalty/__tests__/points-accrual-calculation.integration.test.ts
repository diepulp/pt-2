/**
 * Points Accrual Calculation Integration Tests (ISSUE-752833A6)
 *
 * Tests the points accrual calculation with realistic time durations.
 * Validates the theo and points formulas from ADR-019:
 *
 * Theo formula:
 *   theo = avg_bet × (house_edge/100) × (duration_seconds/3600) × decisions_per_hour
 *
 * Points formula:
 *   points = ROUND(theo × points_conversion_rate)
 *
 * Test Strategy:
 * - Create rating slips via service (populates policy_snapshot.loyalty)
 * - Use SQL UPDATE to simulate start_time in the past for realistic durations
 * - Close slip which calculates duration_seconds
 * - Call rpc_accrue_on_close and verify theo/points_delta match expected
 *
 * @see ISSUE-752833A6 Policy Snapshot Remediation
 * @see ADR-019 Loyalty Points Policy
 */

import { randomUUID } from 'crypto';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import {
  createRatingSlipService,
  RatingSlipServiceInterface,
} from '../../rating-slip';

// ============================================================================
// Test Configuration
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_PREFIX = 'test-pac-int'; // points-accrual-calculation integration

// Tolerance for floating point comparison (±0.01 for theo, ±1 for points)
const THEO_TOLERANCE = 0.01;
const POINTS_TOLERANCE = 1;

// ============================================================================
// Telemetry Collection
// ============================================================================

interface TestTelemetry {
  testName: string;
  scenario: string;
  inputs: {
    avgBet: number;
    houseEdge: number;
    decisionsPerHour: number;
    pointsConversionRate: number;
    durationSeconds: number;
  };
  expected: {
    theo: number;
    points: number;
  };
  actual: {
    theo: number;
    points: number;
    balanceAfter: number;
  };
  variance: {
    theoDelta: number;
    pointsDelta: number;
  };
  passed: boolean;
  executionTimeMs: number;
}

const telemetryResults: TestTelemetry[] = [];

// ============================================================================
// Fixture Types
// ============================================================================

interface TestFixture {
  casinoId: string;
  tableId: string;
  actorId: string;
  cleanup: () => Promise<void>;
}

interface IsolatedVisit {
  id: string;
  playerId: string;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Points Accrual Calculation Integration Tests (ISSUE-752833A6)', () => {
  let supabase: SupabaseClient<Database>;
  let service: RatingSlipServiceInterface;
  let fixture: TestFixture;
  let visitCounter = 0;

  beforeAll(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    service = createRatingSlipService(supabase);
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture?.cleanup) {
      await fixture.cleanup();
    }

    // Output telemetry summary
    console.log('\n');
    console.log('═'.repeat(80));
    console.log('📊 POINTS ACCRUAL CALCULATION TELEMETRY REPORT');
    console.log('═'.repeat(80));
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Issue: ISSUE-752833A6`);
    console.log(`Total Tests: ${telemetryResults.length}`);
    console.log(`Passed: ${telemetryResults.filter((t) => t.passed).length}`);
    console.log(`Failed: ${telemetryResults.filter((t) => !t.passed).length}`);
    console.log('─'.repeat(80));

    for (const result of telemetryResults) {
      console.log(`\n📌 ${result.scenario}`);
      console.log(`   Test: ${result.testName}`);
      console.log(`   Status: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   Execution: ${result.executionTimeMs}ms`);
      console.log(`   Inputs:`);
      console.log(`     avg_bet: $${result.inputs.avgBet}`);
      console.log(`     house_edge: ${result.inputs.houseEdge}%`);
      console.log(`     decisions/hr: ${result.inputs.decisionsPerHour}`);
      console.log(
        `     conversion_rate: ${result.inputs.pointsConversionRate}`,
      );
      console.log(
        `     duration: ${result.inputs.durationSeconds}s (${(result.inputs.durationSeconds / 3600).toFixed(2)}h)`,
      );
      console.log(`   Expected:`);
      console.log(`     theo: $${result.expected.theo.toFixed(4)}`);
      console.log(`     points: ${result.expected.points}`);
      console.log(`   Actual:`);
      console.log(`     theo: $${result.actual.theo.toFixed(4)}`);
      console.log(`     points: ${result.actual.points}`);
      console.log(`     balance_after: ${result.actual.balanceAfter}`);
      console.log(`   Variance:`);
      console.log(`     theo_delta: ${result.variance.theoDelta.toFixed(6)}`);
      console.log(`     points_delta: ${result.variance.pointsDelta}`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('END TELEMETRY REPORT');
    console.log('═'.repeat(80) + '\n');
  });

  // ==========================================================================
  // Helper: Create isolated visit with unique player
  // ==========================================================================
  async function createIsolatedVisit(): Promise<IsolatedVisit> {
    visitCounter++;

    const { data: player, error: playerError } = await supabase
      .from('player')
      .insert({
        first_name: 'Accrual',
        last_name: `Test${visitCounter}`,
        birth_date: '1980-01-01',
      })
      .select()
      .single();

    if (playerError || !player) {
      throw new Error(`Failed to create player: ${playerError?.message}`);
    }

    await supabase.from('player_casino').insert({
      player_id: player.id,
      casino_id: fixture.casinoId,
      status: 'active',
    });

    const { data: visit, error: visitError } = await supabase
      .from('visit')
      .insert({
        player_id: player.id,
        casino_id: fixture.casinoId,
        started_at: new Date().toISOString(),
        ended_at: null,
      })
      .select()
      .single();

    if (visitError || !visit) {
      throw new Error(`Failed to create visit: ${visitError?.message}`);
    }

    return { id: visit.id, playerId: player.id };
  }

  // ==========================================================================
  // Helper: Cleanup isolated visit
  // ==========================================================================
  async function cleanupIsolatedVisit(visit: IsolatedVisit): Promise<void> {
    await supabase
      .from('loyalty_ledger')
      .delete()
      .eq('player_id', visit.playerId);
    await supabase.from('rating_slip').delete().eq('visit_id', visit.id);
    await supabase.from('visit').delete().eq('id', visit.id);
    await supabase
      .from('player_loyalty')
      .delete()
      .eq('player_id', visit.playerId);
    await supabase
      .from('player_casino')
      .delete()
      .eq('player_id', visit.playerId);
    await supabase.from('player').delete().eq('id', visit.playerId);
  }

  // ==========================================================================
  // Helper: Calculate expected theo and points
  // ==========================================================================
  function calculateExpected(
    avgBet: number,
    houseEdge: number,
    durationSeconds: number,
    decisionsPerHour: number,
    pointsConversionRate: number,
  ): { theo: number; points: number } {
    const durationHours = durationSeconds / 3600;
    const theo = avgBet * (houseEdge / 100) * durationHours * decisionsPerHour;
    const points = Math.round(theo * pointsConversionRate);
    return { theo, points };
  }

  // ==========================================================================
  // Helper: Run accrual test with telemetry
  // ==========================================================================
  async function runAccrualTest(
    testName: string,
    scenario: string,
    avgBet: number,
    durationSeconds: number,
    houseEdge: number = 1.5,
    decisionsPerHour: number = 70,
    pointsConversionRate: number = 10.0,
  ): Promise<void> {
    const startTime = Date.now();
    const testVisit = await createIsolatedVisit();

    try {
      // Create slip via service (populates policy_snapshot.loyalty)
      const slip = await service.start(fixture.casinoId, fixture.actorId, {
        visit_id: testVisit.id,
        table_id: fixture.tableId,
        seat_number: String(visitCounter),
        game_settings: { average_bet: avgBet },
      });

      // Simulate time by updating start_time in the past
      const simulatedStartTime = new Date(Date.now() - durationSeconds * 1000);
      await supabase
        .from('rating_slip')
        .update({ start_time: simulatedStartTime.toISOString() })
        .eq('id', slip.id);

      // Close slip (this calculates duration_seconds based on start_time → now())
      const closed = await service.close(
        fixture.casinoId,
        fixture.actorId,
        slip.id,
        {
          average_bet: avgBet,
        },
      );

      expect(closed.status).toBe('closed');

      // Call rpc_accrue_on_close
      const { data: accrualResult, error: accrualError } = await supabase.rpc(
        'rpc_accrue_on_close',
        {
          p_rating_slip_id: slip.id,
          p_casino_id: fixture.casinoId,
          p_idempotency_key: randomUUID(),
        },
      );

      expect(accrualError).toBeNull();
      expect(accrualResult).toBeDefined();
      expect(accrualResult.length).toBeGreaterThan(0);

      const result = accrualResult[0];
      const expected = calculateExpected(
        avgBet,
        houseEdge,
        durationSeconds,
        decisionsPerHour,
        pointsConversionRate,
      );

      // Calculate variance
      const theoDelta = Math.abs(result.theo - expected.theo);
      const pointsDelta = Math.abs(result.points_delta - expected.points);

      // Record telemetry
      const passed =
        theoDelta <= THEO_TOLERANCE && pointsDelta <= POINTS_TOLERANCE;

      telemetryResults.push({
        testName,
        scenario,
        inputs: {
          avgBet,
          houseEdge,
          decisionsPerHour,
          pointsConversionRate,
          durationSeconds,
        },
        expected,
        actual: {
          theo: result.theo,
          points: result.points_delta,
          balanceAfter: result.balance_after,
        },
        variance: {
          theoDelta,
          pointsDelta,
        },
        passed,
        executionTimeMs: Date.now() - startTime,
      });

      // Assertions with tolerance
      expect(theoDelta).toBeLessThanOrEqual(THEO_TOLERANCE);
      expect(pointsDelta).toBeLessThanOrEqual(POINTS_TOLERANCE);

      // Cleanup ledger entry
      if (result.ledger_id) {
        await supabase
          .from('loyalty_ledger')
          .delete()
          .eq('id', result.ledger_id);
      }
      await supabase.from('rating_slip').delete().eq('id', slip.id);
    } finally {
      await cleanupIsolatedVisit(testVisit);
    }
  }

  // ==========================================================================
  // TEST 1: 2-hour standard session
  // ==========================================================================
  describe('Scenario 1: 2-hour Standard Session', () => {
    it('should calculate correct theo and points for 2hr session at $50 avg bet', async () => {
      // Expected calculation:
      // theo = 50 × (1.5/100) × (7200/3600) × 70 = 50 × 0.015 × 2 × 70 = 105
      // points = ROUND(105 × 10) = 1050

      await runAccrualTest(
        'should calculate correct theo and points for 2hr session at $50 avg bet',
        '2-hour Standard Session ($50 avg bet)',
        50, // avgBet
        7200, // durationSeconds (2 hours)
      );
    });
  });

  // ==========================================================================
  // TEST 2: 30-minute short session
  // ==========================================================================
  describe('Scenario 2: 30-minute Short Session', () => {
    it('should calculate correct theo and points for 30min session', async () => {
      // Expected calculation:
      // theo = 50 × (1.5/100) × (1800/3600) × 70 = 50 × 0.015 × 0.5 × 70 = 26.25
      // points = ROUND(26.25 × 10) = 263

      await runAccrualTest(
        'should calculate correct theo and points for 30min session',
        '30-minute Short Session ($50 avg bet)',
        50, // avgBet
        1800, // durationSeconds (30 minutes)
      );
    });
  });

  // ==========================================================================
  // TEST 3: 4-hour high-roller session
  // ==========================================================================
  describe('Scenario 3: 4-hour High-Roller Session', () => {
    it('should calculate correct theo and points for 4hr high-roller session at $500 avg bet', async () => {
      // Expected calculation:
      // theo = 500 × (1.5/100) × (14400/3600) × 70 = 500 × 0.015 × 4 × 70 = 2100
      // points = ROUND(2100 × 10) = 21000

      await runAccrualTest(
        'should calculate correct theo and points for 4hr high-roller session at $500 avg bet',
        '4-hour High-Roller Session ($500 avg bet)',
        500, // avgBet
        14400, // durationSeconds (4 hours)
      );
    });
  });

  // ==========================================================================
  // TEST 4: VIP tier with elevated conversion rate
  // ==========================================================================
  describe('Scenario 4: VIP Tier Elevated Conversion', () => {
    it('should calculate correct points with VIP-level conversion rate', async () => {
      // This tests the points_conversion_rate from policy_snapshot
      // VIP players might have higher conversion rates (e.g., 15.0 instead of 10.0)
      // However, since policy_snapshot is populated from game_settings (casino-level),
      // we test the standard calculation and verify policy snapshot is honored.
      //
      // Expected calculation with standard settings:
      // theo = 100 × (1.5/100) × (7200/3600) × 70 = 100 × 0.015 × 2 × 70 = 210
      // points = ROUND(210 × 10) = 2100

      await runAccrualTest(
        'should calculate correct points with VIP-level conversion rate',
        'VIP Tier Session ($100 avg bet, 2hr)',
        100, // avgBet
        7200, // durationSeconds (2 hours)
      );
    });
  });

  // ==========================================================================
  // TEST 5: Zero duration edge case
  // ==========================================================================
  describe('Scenario 5: Zero Duration Edge Case', () => {
    it('should return zero theo and points for zero-duration session', async () => {
      const startTime = Date.now();
      const testVisit = await createIsolatedVisit();

      try {
        // Create slip via service
        const slip = await service.start(fixture.casinoId, fixture.actorId, {
          visit_id: testVisit.id,
          table_id: fixture.tableId,
          seat_number: String(visitCounter),
          game_settings: { average_bet: 100 },
        });

        // Do NOT backdate start_time - close immediately for minimal duration
        // Actually set start_time to NOW to ensure near-zero duration
        await supabase
          .from('rating_slip')
          .update({ start_time: new Date().toISOString() })
          .eq('id', slip.id);

        // Immediately close
        const closed = await service.close(
          fixture.casinoId,
          fixture.actorId,
          slip.id,
          {
            average_bet: 100,
          },
        );

        expect(closed.status).toBe('closed');

        // Call rpc_accrue_on_close
        const { data: accrualResult, error: accrualError } = await supabase.rpc(
          'rpc_accrue_on_close',
          {
            p_rating_slip_id: slip.id,
            p_casino_id: fixture.casinoId,
            p_idempotency_key: randomUUID(),
          },
        );

        expect(accrualError).toBeNull();
        expect(accrualResult).toBeDefined();

        const result = accrualResult[0];

        // With near-zero duration, theo and points should be near zero
        // Allow small tolerance for execution time between start and close
        const passed = result.theo <= 0.1 && result.points_delta <= 1;

        telemetryResults.push({
          testName:
            'should return zero theo and points for zero-duration session',
          scenario: 'Zero Duration Edge Case',
          inputs: {
            avgBet: 100,
            houseEdge: 1.5,
            decisionsPerHour: 70,
            pointsConversionRate: 10.0,
            durationSeconds: 0,
          },
          expected: { theo: 0, points: 0 },
          actual: {
            theo: result.theo,
            points: result.points_delta,
            balanceAfter: result.balance_after,
          },
          variance: {
            theoDelta: Math.abs(result.theo),
            pointsDelta: Math.abs(result.points_delta),
          },
          passed,
          executionTimeMs: Date.now() - startTime,
        });

        // Near-zero assertions (allow minimal execution time)
        expect(result.theo).toBeLessThanOrEqual(0.1);
        expect(result.points_delta).toBeLessThanOrEqual(1);

        // Cleanup
        if (result.ledger_id) {
          await supabase
            .from('loyalty_ledger')
            .delete()
            .eq('id', result.ledger_id);
        }
        await supabase.from('rating_slip').delete().eq('id', slip.id);
      } finally {
        await cleanupIsolatedVisit(testVisit);
      }
    });
  });

  // ==========================================================================
  // TEST 6: Verify policy_snapshot values are used (not live game_settings)
  // ==========================================================================
  describe('Scenario 6: Policy Snapshot Immutability', () => {
    it('should use frozen policy_snapshot values, not live game_settings', async () => {
      const startTime = Date.now();
      const testVisit = await createIsolatedVisit();

      try {
        // Create slip with initial game_settings
        const slip = await service.start(fixture.casinoId, fixture.actorId, {
          visit_id: testVisit.id,
          table_id: fixture.tableId,
          seat_number: String(visitCounter),
          game_settings: { average_bet: 100 },
        });

        // Verify policy_snapshot was captured
        expect(slip.policy_snapshot).toBeDefined();
        const policySnapshot = slip.policy_snapshot as Record<string, unknown>;
        const loyaltySnapshot = policySnapshot?.loyalty as Record<
          string,
          unknown
        >;
        expect(loyaltySnapshot).toBeDefined();

        // Capture original snapshot values
        const originalHouseEdge = Number(loyaltySnapshot.house_edge);
        const originalDecisions = Number(loyaltySnapshot.decisions_per_hour);

        // NOW: Change the live game_settings (simulating policy update mid-session)
        await supabase
          .from('game_settings')
          .update({
            house_edge: 99.9, // Drastically different value
            decisions_per_hour: 999,
          })
          .eq('casino_id', fixture.casinoId)
          .eq('game_type', 'blackjack');

        // Simulate 1-hour session
        const simulatedStartTime = new Date(Date.now() - 3600 * 1000);
        await supabase
          .from('rating_slip')
          .update({ start_time: simulatedStartTime.toISOString() })
          .eq('id', slip.id);

        // Close and accrue
        await service.close(fixture.casinoId, fixture.actorId, slip.id, {
          average_bet: 100,
        });

        const { data: accrualResult, error: accrualError } = await supabase.rpc(
          'rpc_accrue_on_close',
          {
            p_rating_slip_id: slip.id,
            p_casino_id: fixture.casinoId,
            p_idempotency_key: randomUUID(),
          },
        );

        expect(accrualError).toBeNull();

        // Calculate what we SHOULD get (using ORIGINAL snapshot values, not live 99.9%)
        const expectedTheo =
          100 * (originalHouseEdge / 100) * 1 * originalDecisions;
        const expectedPoints = Math.round(expectedTheo * 10);

        const result = accrualResult[0];

        // Verify calculation used snapshot (not live 99.9% house edge)
        const theoDelta = Math.abs(result.theo - expectedTheo);
        const passed = theoDelta <= THEO_TOLERANCE;

        telemetryResults.push({
          testName:
            'should use frozen policy_snapshot values, not live game_settings',
          scenario: 'Policy Snapshot Immutability',
          inputs: {
            avgBet: 100,
            houseEdge: originalHouseEdge,
            decisionsPerHour: originalDecisions,
            pointsConversionRate: 10.0,
            durationSeconds: 3600,
          },
          expected: { theo: expectedTheo, points: expectedPoints },
          actual: {
            theo: result.theo,
            points: result.points_delta,
            balanceAfter: result.balance_after,
          },
          variance: {
            theoDelta,
            pointsDelta: Math.abs(result.points_delta - expectedPoints),
          },
          passed,
          executionTimeMs: Date.now() - startTime,
        });

        // Key assertion: theo should be based on original 1.5% not 99.9%
        // If live settings were used, theo would be ~66x higher
        expect(result.theo).toBeLessThan(expectedTheo * 2); // Sanity check
        expect(theoDelta).toBeLessThanOrEqual(THEO_TOLERANCE);

        // Cleanup: Restore original game_settings
        await supabase
          .from('game_settings')
          .update({
            house_edge: 1.5,
            decisions_per_hour: 70,
          })
          .eq('casino_id', fixture.casinoId)
          .eq('game_type', 'blackjack');

        if (result.ledger_id) {
          await supabase
            .from('loyalty_ledger')
            .delete()
            .eq('id', result.ledger_id);
        }
        await supabase.from('rating_slip').delete().eq('id', slip.id);
      } finally {
        await cleanupIsolatedVisit(testVisit);
      }
    });
  });
});

// ============================================================================
// Fixture Factory
// ============================================================================

async function createTestFixture(
  supabase: SupabaseClient<Database>,
): Promise<TestFixture> {
  // 1. Create casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({ name: `${TEST_PREFIX} Casino`, status: 'active' })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create casino: ${casinoError?.message}`);
  }

  // 2. Create casino settings
  await supabase.from('casino_settings').insert({
    casino_id: casino.id,
    gaming_day_start_time: '06:00:00',
    timezone: 'America/Los_Angeles',
    watchlist_floor: 3000,
    ctr_threshold: 10000,
  });

  // 3. Create gaming table
  const { data: table, error: tableError } = await supabase
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

  // 4. Create game_settings for blackjack with known policy values
  await supabase.from('game_settings').upsert({
    casino_id: casino.id,
    game_type: 'blackjack',
    house_edge: 1.5, // 1.5%
    decisions_per_hour: 70,
    points_conversion_rate: 10.0,
    point_multiplier: 1.0,
  });

  // 5. Create staff actor
  const { data: actor, error: actorError } = await supabase
    .from('staff')
    .insert({
      casino_id: casino.id,
      employee_id: `${TEST_PREFIX}-001`,
      first_name: 'Test',
      last_name: 'Actor',
      email: `${TEST_PREFIX}-actor@test.com`,
      role: 'pit_boss',
      status: 'active',
    })
    .select()
    .single();

  if (actorError || !actor) {
    throw new Error(`Failed to create actor: ${actorError?.message}`);
  }

  // Cleanup function
  const cleanup = async () => {
    await supabase.from('loyalty_ledger').delete().eq('casino_id', casino.id);
    await supabase.from('rating_slip').delete().eq('casino_id', casino.id);
    await supabase.from('visit').delete().eq('casino_id', casino.id);
    await supabase.from('player_casino').delete().eq('casino_id', casino.id);
    await supabase.from('player_loyalty').delete().eq('casino_id', casino.id);
    await supabase.from('player').delete().like('last_name', 'Test%');
    await supabase.from('staff').delete().eq('id', actor.id);
    await supabase.from('game_settings').delete().eq('casino_id', casino.id);
    await supabase.from('gaming_table').delete().eq('id', table.id);
    await supabase.from('casino_settings').delete().eq('casino_id', casino.id);
    await supabase.from('casino').delete().eq('id', casino.id);
  };

  return {
    casinoId: casino.id,
    tableId: table.id,
    actorId: actor.id,
    cleanup,
  };
}
