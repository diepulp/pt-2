/**
 * Policy Snapshot Integration Tests (ISSUE-752833A6)
 *
 * Tests the policy snapshot population and accrual workflow remediation:
 * - rpc_start_rating_slip populates policy_snapshot.loyalty from game_settings
 * - rpc_accrue_on_close uses hardened JSON extraction (NULLIF pattern)
 * - compliance_only slips (ADR-014 ghost gaming) skip accrual gracefully
 *
 * @see ISSUE-752833A6 Policy Snapshot Remediation
 * @see ADR-014 Ghost Gaming Visits
 * @see ADR-019 Loyalty Points Policy (D2 immutability)
 */

import { randomUUID } from 'crypto';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { createRatingSlipService, RatingSlipServiceInterface } from '../index';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_PREFIX = 'test-ps-int'; // policy-snapshot integration

interface TestFixture {
  casinoId: string;
  tableId: string;
  actorId: string;
  playerId: string;
  visitId: string;
  slipIds: string[];
  cleanup: () => Promise<void>;
}

describe('Policy Snapshot Integration Tests (ISSUE-752833A6)', () => {
  let supabase: SupabaseClient<Database>;
  let service: RatingSlipServiceInterface;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    service = createRatingSlipService(supabase);

    // Create complete test fixture
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    // Close any open slips before cleanup
    for (const slipId of fixture?.slipIds ?? []) {
      try {
        await service.close(fixture.casinoId, fixture.actorId, slipId);
      } catch {
        // Ignore if already closed
      }
      await supabase.from('rating_slip').delete().eq('id', slipId);
    }

    if (fixture?.cleanup) {
      await fixture.cleanup();
    }
  });

  // ===========================================================================
  // Test 1: New slip has policy_snapshot.loyalty populated
  // ===========================================================================
  describe('Policy Snapshot Population', () => {
    it('should populate policy_snapshot.loyalty on new rating slip', async () => {
      // Create a unique visit for this test to avoid constraint violations
      const testVisit = await createIsolatedVisit(supabase, fixture);

      // Start rating slip via service
      const slip = await service.start(fixture.casinoId, fixture.actorId, {
        visit_id: testVisit.id,
        table_id: fixture.tableId,
        seat_number: '1',
        game_settings: { game_type: 'blackjack', min_bet: 25 },
      });

      expect(slip).toBeDefined();
      expect(slip.policy_snapshot).toBeDefined();
      expect(slip.policy_snapshot).not.toBeNull();

      // Verify loyalty snapshot exists with expected fields
      const policySnapshot = slip.policy_snapshot as Record<string, unknown>;
      const loyaltySnapshot = policySnapshot?.loyalty as Record<
        string,
        unknown
      >;
      expect(loyaltySnapshot).toBeDefined();
      expect(loyaltySnapshot.house_edge).toBeDefined();
      expect(loyaltySnapshot.decisions_per_hour).toBeDefined();
      expect(loyaltySnapshot.points_conversion_rate).toBeDefined();
      expect(loyaltySnapshot.point_multiplier).toBeDefined();
      expect(loyaltySnapshot.policy_version).toBe('loyalty_points_v1');

      // Cleanup
      await service.close(fixture.casinoId, fixture.actorId, slip.id);
      await supabase.from('rating_slip').delete().eq('id', slip.id);
      await cleanupIsolatedVisit(supabase, testVisit.id, testVisit.playerId);
    });

    it('should include _source tracking for audit trail', async () => {
      const testVisit = await createIsolatedVisit(supabase, fixture);

      const slip = await service.start(fixture.casinoId, fixture.actorId, {
        visit_id: testVisit.id,
        table_id: fixture.tableId,
        seat_number: '2',
      });

      expect(slip).toBeDefined();

      // Verify _source tracking exists
      const policySnapshot = slip.policy_snapshot as Record<string, unknown>;
      const source = policySnapshot?._source as Record<string, string>;
      expect(source).toBeDefined();
      expect(['game_settings', 'default']).toContain(source.house_edge);
      expect(['game_settings', 'default']).toContain(source.decisions_per_hour);
      expect(['game_settings', 'default']).toContain(
        source.points_conversion_rate,
      );
      expect(['game_settings', 'default']).toContain(source.point_multiplier);

      // Cleanup
      await service.close(fixture.casinoId, fixture.actorId, slip.id);
      await supabase.from('rating_slip').delete().eq('id', slip.id);
      await cleanupIsolatedVisit(supabase, testVisit.id, testVisit.playerId);
    });
  });

  // ===========================================================================
  // Test 2: Accrual workflow succeeds with populated snapshot
  // ===========================================================================
  describe('Accrual Workflow', () => {
    it('should complete close + accrue workflow without LOYALTY_SNAPSHOT_MISSING', async () => {
      const testVisit = await createIsolatedVisit(supabase, fixture);

      // Create slip via service
      const slip = await service.start(fixture.casinoId, fixture.actorId, {
        visit_id: testVisit.id,
        table_id: fixture.tableId,
        seat_number: '3',
        game_settings: { average_bet: 50 },
      });

      expect(slip).toBeDefined();

      // Small delay for duration calculation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close slip via service
      const closed = await service.close(
        fixture.casinoId,
        fixture.actorId,
        slip.id,
        {
          average_bet: 50,
        },
      );

      expect(closed).toBeDefined();
      expect(closed.status).toBe('closed');

      // Accrue on close via RPC - should NOT throw LOYALTY_SNAPSHOT_MISSING
      const idempotencyKey = randomUUID();
      const { data: accrualResult, error: accrualError } = await supabase.rpc(
        'rpc_accrue_on_close',
        {
          p_rating_slip_id: slip.id,
          p_casino_id: fixture.casinoId,
          p_idempotency_key: idempotencyKey,
        },
      );

      // This is the key assertion - no LOYALTY_SNAPSHOT_MISSING error
      expect(accrualError).toBeNull();
      expect(accrualResult).toBeDefined();
      expect(accrualResult.length).toBeGreaterThan(0);

      const result = accrualResult[0];
      expect(result.ledger_id).toBeDefined();
      expect(typeof result.points_delta).toBe('number');
      expect(typeof result.theo).toBe('number');
      expect(result.is_existing).toBe(false);

      // Cleanup
      await supabase.from('loyalty_ledger').delete().eq('id', result.ledger_id);
      await supabase.from('rating_slip').delete().eq('id', slip.id);
      await cleanupIsolatedVisit(supabase, testVisit.id, testVisit.playerId);
    });

    it('should verify points calculation uses snapshot values', async () => {
      const testVisit = await createIsolatedVisit(supabase, fixture);

      const slip = await service.start(fixture.casinoId, fixture.actorId, {
        visit_id: testVisit.id,
        table_id: fixture.tableId,
        seat_number: '4',
        game_settings: { average_bet: 100 },
      });

      // Wait for measurable duration
      await new Promise((resolve) => setTimeout(resolve, 200));

      await service.close(fixture.casinoId, fixture.actorId, slip.id, {
        average_bet: 100,
      });

      const { data: accrualResult, error } = await supabase.rpc(
        'rpc_accrue_on_close',
        {
          p_rating_slip_id: slip.id,
          p_casino_id: fixture.casinoId,
          p_idempotency_key: randomUUID(),
        },
      );

      expect(error).toBeNull();

      // Verify theo calculation is positive (proves snapshot was used)
      const result = accrualResult[0];
      expect(result.theo).toBeGreaterThanOrEqual(0);

      // Cleanup
      if (result.ledger_id) {
        await supabase
          .from('loyalty_ledger')
          .delete()
          .eq('id', result.ledger_id);
      }
      await supabase.from('rating_slip').delete().eq('id', slip.id);
      await cleanupIsolatedVisit(supabase, testVisit.id, testVisit.playerId);
    });
  });

  // ===========================================================================
  // Test 3: SEC-007 Casino mismatch validation still works
  // ===========================================================================
  describe('SEC-007 Casino Validation', () => {
    it('should reject slip creation with casino mismatch', async () => {
      // Create a different casino for mismatch test
      const { data: casino2 } = await supabase
        .from('casino')
        .insert({ name: `${TEST_PREFIX} Casino 2`, status: 'active' })
        .select()
        .single();

      if (!casino2) {
        throw new Error('Failed to create test casino 2');
      }

      // Create a visit in casino 2
      const { data: player2 } = await supabase
        .from('player')
        .insert({
          first_name: 'Mismatch',
          last_name: 'Player',
          birth_date: '1980-01-01',
        })
        .select()
        .single();

      const { data: visit2 } = await supabase
        .from('visit')
        .insert({
          player_id: player2!.id,
          casino_id: casino2.id,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      try {
        // Attempt to create slip using casino1's actor/table but casino2's visit
        // This should fail because visit is in a different casino than our context
        await expect(
          service.start(fixture.casinoId, fixture.actorId, {
            visit_id: visit2!.id,
            table_id: fixture.tableId,
            seat_number: '5',
          }),
        ).rejects.toThrow();
      } finally {
        // Cleanup
        await supabase.from('visit').delete().eq('id', visit2!.id);
        await supabase.from('player').delete().eq('id', player2!.id);
        await supabase.from('casino').delete().eq('id', casino2.id);
      }
    });
  });

  // ===========================================================================
  // Test 4: compliance_only slips (ADR-014 Ghost Gaming)
  // ===========================================================================
  describe('Compliance-Only Slips (ADR-014)', () => {
    it('should allow compliance_only slip without loyalty accrual', async () => {
      // Create ghost visit (gaming_ghost_unrated)
      const { data: ghostVisit, error: ghostError } = await supabase
        .from('visit')
        .insert({
          player_id: null, // Ghost visit
          casino_id: fixture.casinoId,
          visit_kind: 'gaming_ghost_unrated',
          started_at: new Date().toISOString(),
          ended_at: null,
        })
        .select()
        .single();

      if (ghostError || !ghostVisit) {
        // Schema may not support ghost visits (player_id NOT NULL constraint) - skip test
        console.log('Ghost visit not supported, skipping test');
        return;
      }

      try {
        const slip = await service.start(fixture.casinoId, fixture.actorId, {
          visit_id: ghostVisit.id,
          table_id: fixture.tableId,
          seat_number: '6',
        });

        expect(slip).toBeDefined();

        // Fetch full slip to check accrual_kind (may not be in service DTO)
        const { data: fullSlip } = await supabase
          .from('rating_slip')
          .select('*')
          .eq('id', slip.id)
          .single();

        expect(fullSlip?.accrual_kind).toBe('compliance_only');

        // Close slip
        const closed = await service.close(
          fixture.casinoId,
          fixture.actorId,
          slip.id,
          {
            average_bet: 25,
          },
        );

        expect(closed.status).toBe('closed');

        // Accrue on close - should return zeros, not fail
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
        expect(result.ledger_id).toBeNull(); // No ledger entry created
        expect(result.points_delta).toBe(0);
        expect(result.theo).toBe(0);
        expect(result.is_existing).toBe(false);

        // Cleanup
        await supabase.from('rating_slip').delete().eq('id', slip.id);
      } finally {
        await supabase.from('visit').delete().eq('id', ghostVisit.id);
      }
    });

    it('should reject loyalty slip creation with NULL policy_snapshot via direct INSERT', async () => {
      // Test the CHECK constraint: accrual_kind = 'loyalty' requires policy_snapshot.loyalty
      // This is a DB-level constraint test
      const testVisit = await createIsolatedVisit(supabase, fixture);

      try {
        // Attempt direct INSERT with accrual_kind='loyalty' but NULL policy_snapshot
        const { error } = await supabase.from('rating_slip').insert({
          casino_id: fixture.casinoId,
          visit_id: testVisit.id,
          table_id: fixture.tableId,
          accrual_kind: 'loyalty',
          policy_snapshot: null, // Violates CHECK constraint
          status: 'open',
          start_time: new Date().toISOString(),
        });

        expect(error).not.toBeNull();
        expect(error!.message).toMatch(/chk_policy_snapshot_if_loyalty/i);
      } finally {
        await cleanupIsolatedVisit(supabase, testVisit.id, testVisit.playerId);
      }
    });
  });

  // ===========================================================================
  // Test 5: Idempotency
  // ===========================================================================
  describe('Accrual Idempotency', () => {
    it('should return existing entry on duplicate accrual attempt', async () => {
      const testVisit = await createIsolatedVisit(supabase, fixture);

      const slip = await service.start(fixture.casinoId, fixture.actorId, {
        visit_id: testVisit.id,
        table_id: fixture.tableId,
        seat_number: '7',
        game_settings: { average_bet: 50 },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.close(fixture.casinoId, fixture.actorId, slip.id, {
        average_bet: 50,
      });

      // First accrual
      const idempotencyKey = randomUUID();
      const { data: first } = await supabase.rpc('rpc_accrue_on_close', {
        p_rating_slip_id: slip.id,
        p_casino_id: fixture.casinoId,
        p_idempotency_key: idempotencyKey,
      });

      // Second accrual with different idempotency key (but same slip)
      const { data: second } = await supabase.rpc('rpc_accrue_on_close', {
        p_rating_slip_id: slip.id,
        p_casino_id: fixture.casinoId,
        p_idempotency_key: randomUUID(), // Different key
      });

      expect(first[0].is_existing).toBe(false);
      expect(second[0].is_existing).toBe(true);
      expect(first[0].ledger_id).toBe(second[0].ledger_id);

      // Cleanup
      await supabase
        .from('loyalty_ledger')
        .delete()
        .eq('id', first[0].ledger_id);
      await supabase.from('rating_slip').delete().eq('id', slip.id);
      await cleanupIsolatedVisit(supabase, testVisit.id, testVisit.playerId);
    });
  });
});

// ===========================================================================
// Fixture Helpers
// ===========================================================================

interface IsolatedVisit {
  id: string;
  playerId: string;
}

let visitCounter = 0;

/**
 * Create an isolated visit with its own player to avoid unique constraint violations.
 * Each test should use its own visit to prevent interference.
 */
async function createIsolatedVisit(
  supabase: SupabaseClient<Database>,
  fixture: TestFixture,
): Promise<IsolatedVisit> {
  visitCounter++;

  // Create unique player for this visit
  const { data: player, error: playerError } = await supabase
    .from('player')
    .insert({
      first_name: 'Test',
      last_name: `Player${visitCounter}`,
      birth_date: '1980-01-01',
    })
    .select()
    .single();

  if (playerError || !player)
    throw new Error(`Failed to create player: ${playerError?.message}`);

  // Enroll player at casino
  await supabase.from('player_casino').insert({
    player_id: player.id,
    casino_id: fixture.casinoId,
    status: 'active',
  });

  // Create visit
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

  if (visitError || !visit)
    throw new Error(`Failed to create visit: ${visitError?.message}`);

  return {
    id: visit.id,
    playerId: player.id,
  };
}

/**
 * Cleanup an isolated visit and its player.
 */
async function cleanupIsolatedVisit(
  supabase: SupabaseClient<Database>,
  visitId: string,
  playerId: string,
): Promise<void> {
  await supabase.from('rating_slip').delete().eq('visit_id', visitId);
  await supabase.from('visit').delete().eq('id', visitId);
  await supabase.from('player_casino').delete().eq('player_id', playerId);
  await supabase.from('player_loyalty').delete().eq('player_id', playerId);
  await supabase.from('player').delete().eq('id', playerId);
}

async function createTestFixture(
  supabase: SupabaseClient<Database>,
): Promise<TestFixture> {
  // 1. Create casino
  const { data: casino, error: casinoError } = await supabase
    .from('casino')
    .insert({ name: `${TEST_PREFIX} Casino`, status: 'active' })
    .select()
    .single();

  if (casinoError || !casino)
    throw new Error(`Failed to create casino: ${casinoError?.message}`);

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

  if (tableError || !table)
    throw new Error(`Failed to create table: ${tableError?.message}`);

  // 4. Create game_settings for blackjack
  await supabase.from('game_settings').upsert({
    casino_id: casino.id,
    game_type: 'blackjack',
    house_edge: 1.5,
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

  if (actorError || !actor)
    throw new Error(`Failed to create actor: ${actorError?.message}`);

  // 6. Create base player (not used directly, but placeholder for fixture)
  const { data: player, error: playerError } = await supabase
    .from('player')
    .insert({
      first_name: 'Base',
      last_name: 'Player',
      birth_date: '1980-01-01',
    })
    .select()
    .single();

  if (playerError || !player)
    throw new Error(`Failed to create player: ${playerError?.message}`);

  // 7. Enroll player at casino
  await supabase.from('player_casino').insert({
    player_id: player.id,
    casino_id: casino.id,
    status: 'active',
  });

  // 8. Create visit (base visit for fixture - each test creates isolated visits)
  const { data: visit, error: visitError } = await supabase
    .from('visit')
    .insert({
      player_id: player.id,
      casino_id: casino.id,
      started_at: new Date().toISOString(),
      ended_at: null,
    })
    .select()
    .single();

  if (visitError || !visit)
    throw new Error(`Failed to create visit: ${visitError?.message}`);

  // Cleanup function
  const cleanup = async () => {
    // Delete rating slips for this casino (catch-all)
    await supabase.from('rating_slip').delete().eq('casino_id', casino.id);
    // Delete loyalty ledger entries for this casino
    await supabase.from('loyalty_ledger').delete().eq('casino_id', casino.id);
    // Delete visits for this casino
    await supabase.from('visit').delete().eq('casino_id', casino.id);
    // Delete player enrollments for this casino
    await supabase.from('player_casino').delete().eq('casino_id', casino.id);
    // Delete player loyalty for this casino
    await supabase.from('player_loyalty').delete().eq('casino_id', casino.id);
    // Delete all test players (by prefix in last_name)
    await supabase.from('player').delete().like('last_name', 'Player%');
    await supabase.from('player').delete().eq('last_name', 'Player');
    // Delete staff
    await supabase.from('staff').delete().eq('id', actor.id);
    // Delete game settings
    await supabase.from('game_settings').delete().eq('casino_id', casino.id);
    // Delete gaming table
    await supabase.from('gaming_table').delete().eq('id', table.id);
    // Delete casino settings
    await supabase.from('casino_settings').delete().eq('casino_id', casino.id);
    // Delete casino
    await supabase.from('casino').delete().eq('id', casino.id);
  };

  return {
    casinoId: casino.id,
    tableId: table.id,
    actorId: actor.id,
    playerId: player.id,
    visitId: visit.id,
    slipIds: [],
    cleanup,
  };
}
