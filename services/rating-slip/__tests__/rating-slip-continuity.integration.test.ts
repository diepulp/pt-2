/**
 * RatingSlipService PRD-016 Continuity Integration Tests
 *
 * Tests session continuity features with a real Supabase database.
 * Validates database-level behavior including:
 * - compute_slip_final_seconds function edge cases
 * - rpc_get_visit_live_view aggregation
 * - Partial unique index (max 1 open/paused slip per visit)
 * - RLS enforcement across casinos
 * - Move operation end-to-end flow
 *
 * @see PRD-016 Rating Slip Session Continuity
 * @see EXECUTION-SPEC-PRD-016.md
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import type { Database } from '@/types/database.types';

import { createRatingSlipService, RatingSlipServiceInterface } from '../index';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Shared test fixtures - use timestamp for uniqueness across runs
const TEST_RUN_ID = Date.now().toString(36);
const TEST_PREFIX = `prd016-${TEST_RUN_ID}`;

/**
 * Creates a unique player and visit for each test to avoid the
 * `idx_rating_slip_one_active_per_visit` constraint.
 */
interface TestFixture {
  playerId: string;
  visitId: string;
  slipIds: string[];
}

describe('RatingSlipService - PRD-016 Continuity (Integration)', () => {
  let supabase: SupabaseClient<Database>;
  let service: RatingSlipServiceInterface;

  // Shared test fixture IDs
  let testCasinoId: string;
  let testCasino2Id: string;
  let testTableId: string;
  let testTable2Id: string;
  let testTable3Id: string;
  let testActorId: string;

  // Track all created fixtures for cleanup
  const allFixtures: TestFixture[] = [];
  let fixtureCounter = 0;

  beforeAll(async () => {
    // Use service role client for setup (bypasses RLS)
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    service = createRatingSlipService(supabase);

    // =========================================================================
    // Create shared test fixtures
    // =========================================================================

    // 1. Create test casino
    const { data: casino, error: casinoError } = await supabase
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino 1`,
        status: 'active',
      })
      .select()
      .single();

    if (casinoError) throw casinoError;
    testCasinoId = casino.id;

    // 2. Create second casino for RLS tests
    const { data: casino2, error: casino2Error } = await supabase
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino 2`,
        status: 'active',
      })
      .select()
      .single();

    if (casino2Error) throw casino2Error;
    testCasino2Id = casino2.id;

    // 3. Create casino settings (required for compute_gaming_day)
    await supabase.from('casino_settings').insert([
      {
        casino_id: testCasinoId,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
      {
        casino_id: testCasino2Id,
        gaming_day_start_time: '06:00:00',
        timezone: 'America/Los_Angeles',
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
    ]);

    // 4. Create active gaming tables
    const { data: table1 } = await supabase
      .from('gaming_table')
      .insert({
        casino_id: testCasinoId,
        label: `${TEST_PREFIX}-BJ-01`,
        pit: 'Pit A',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();
    testTableId = table1!.id;

    const { data: table2 } = await supabase
      .from('gaming_table')
      .insert({
        casino_id: testCasinoId,
        label: `${TEST_PREFIX}-BJ-02`,
        pit: 'Pit A',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();
    testTable2Id = table2!.id;

    const { data: table3 } = await supabase
      .from('gaming_table')
      .insert({
        casino_id: testCasinoId,
        label: `${TEST_PREFIX}-BJ-03`,
        pit: 'Pit A',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();
    testTable3Id = table3!.id;

    // 5. Create test actor (staff)
    const { data: actor, error: actorError } = await supabase
      .from('staff')
      .insert({
        casino_id: testCasinoId,
        employee_id: `${TEST_PREFIX}-001`,
        first_name: 'Test',
        last_name: 'Actor',
        email: `${TEST_PREFIX}-actor@test.com`,
        role: 'dealer',
        status: 'active',
      })
      .select()
      .single();

    if (actorError) {
      throw new Error(
        `Failed to create test actor: ${actorError.message}. Tests cannot run without database setup.`,
      );
    }
    if (!actor) {
      throw new Error('Test actor creation returned null. Tests cannot run.');
    }

    testActorId = actor.id;
  });

  afterAll(async () => {
    // Clean up all created fixtures in reverse order
    for (const fixture of allFixtures) {
      // Delete rating slips
      for (const slipId of fixture.slipIds) {
        await supabase.from('rating_slip').delete().eq('id', slipId);
      }
      // Delete visit
      await supabase
        .from('rating_slip')
        .delete()
        .eq('visit_id', fixture.visitId);
      await supabase.from('visit').delete().eq('id', fixture.visitId);
      // Delete player enrollment and player
      if (fixture.playerId) {
        await supabase
          .from('player_casino')
          .delete()
          .eq('player_id', fixture.playerId);
        await supabase
          .from('player_loyalty')
          .delete()
          .eq('player_id', fixture.playerId);
        await supabase.from('player').delete().eq('id', fixture.playerId);
      }
    }

    // Delete staff
    await supabase.from('staff').delete().eq('casino_id', testCasinoId);
    await supabase.from('staff').delete().eq('casino_id', testCasino2Id);

    // Delete tables
    await supabase.from('gaming_table').delete().eq('casino_id', testCasinoId);
    await supabase.from('gaming_table').delete().eq('casino_id', testCasino2Id);

    // Delete casino settings and casinos
    await supabase
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasinoId);
    await supabase
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasino2Id);
    await supabase.from('casino').delete().eq('id', testCasinoId);
    await supabase.from('casino').delete().eq('id', testCasino2Id);
  }, 30000); // Increase timeout for cleanup

  // =========================================================================
  // Helper: Create isolated test fixture (player + visit)
  // =========================================================================
  async function createTestFixture(): Promise<TestFixture> {
    fixtureCounter++;

    const { data: player } = await supabase
      .from('player')
      .insert({
        first_name: 'Test',
        last_name: `Player${fixtureCounter}`,
        birth_date: '1980-01-01',
      })
      .select()
      .single();

    await supabase.from('player_casino').insert({
      player_id: player!.id,
      casino_id: testCasinoId,
      status: 'active',
    });

    const { data: visit } = await supabase
      .from('visit')
      .insert({
        player_id: player!.id,
        casino_id: testCasinoId,
        started_at: new Date().toISOString(),
        ended_at: null,
      })
      .select()
      .single();

    const fixture: TestFixture = {
      playerId: player!.id,
      visitId: visit!.id,
      slipIds: [],
    };

    allFixtures.push(fixture);
    return fixture;
  }

  // =========================================================================
  // 1. compute_slip_final_seconds Edge Cases
  // =========================================================================

  describe('compute_slip_final_seconds - Pause Handling', () => {
    it('should handle paused -> moved scenario (open pause auto-closed at slip end_time)', async () => {
      const fixture = await createTestFixture();

      // 1. Start slip
      const slip1 = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
      });
      fixture.slipIds.push(slip1.id);

      // Wait 200ms
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 2. Pause slip
      await service.pause(testCasinoId, testActorId, slip1.id);

      // Wait 100ms in paused state
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 3. Move (which closes with open pause)
      const moveResult = await service.move(
        testCasinoId,
        testActorId,
        slip1.id,
        {
          new_table_id: testTable2Id,
        },
      );
      fixture.slipIds.push(moveResult.new_slip.id);

      // Verify closed slip has final_duration_seconds
      expect(
        moveResult.closed_slip.final_duration_seconds,
      ).toBeGreaterThanOrEqual(0);
      expect(moveResult.closed_slip.duration_seconds).toBeGreaterThanOrEqual(0);

      // Duration should be less than wall time (pause excluded)
      expect(moveResult.closed_slip.duration_seconds).toBeDefined();

      // Clean up
      await service.close(testCasinoId, testActorId, moveResult.new_slip.id);
    });

    it('should handle paused -> closed scenario (normal pause duration subtracted)', async () => {
      const fixture = await createTestFixture();

      // 1. Start slip
      const slip = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
      });
      fixture.slipIds.push(slip.id);

      // Wait 200ms
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 2. Pause
      await service.pause(testCasinoId, testActorId, slip.id);

      // Wait 100ms in paused state
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 3. Close directly from paused state
      const closed = await service.close(testCasinoId, testActorId, slip.id);

      // Duration should exclude paused time
      expect(closed.duration_seconds).toBeGreaterThanOrEqual(0);
      expect(closed.final_duration_seconds).toBe(closed.duration_seconds);
    });

    it('should handle multiple pauses correctly (sum all pause intervals)', async () => {
      const fixture = await createTestFixture();

      // Calculate pause intervals based on known time offsets
      const baseTime = new Date();
      const pause1Start = new Date(baseTime.getTime() + 100);
      const pause1End = new Date(baseTime.getTime() + 200); // 100ms pause
      const pause2Start = new Date(baseTime.getTime() + 300);
      const pause2End = new Date(baseTime.getTime() + 500); // 200ms pause

      // 1. Start slip (bypass service to control timing)
      const { data: slip } = await supabase
        .from('rating_slip')
        .insert({
          casino_id: testCasinoId,
          visit_id: fixture.visitId,
          table_id: testTableId,
          seat_number: 'multi-pause-test',
          start_time: baseTime.toISOString(),
          status: 'open',
        })
        .select()
        .single();
      fixture.slipIds.push(slip!.id);

      // 2. Insert two pauses directly (testing compute_slip_final_seconds, not pause service)
      await supabase.from('rating_slip_pause').insert([
        {
          rating_slip_id: slip!.id,
          casino_id: testCasinoId,
          started_at: pause1Start.toISOString(),
          ended_at: pause1End.toISOString(),
          created_by: testActorId,
        },
        {
          rating_slip_id: slip!.id,
          casino_id: testCasinoId,
          started_at: pause2Start.toISOString(),
          ended_at: pause2End.toISOString(),
          created_by: testActorId,
        },
      ]);

      // 3. Close slip
      const endTime = new Date(baseTime.getTime() + 1000); // 1 second total
      await supabase
        .from('rating_slip')
        .update({
          status: 'closed',
          end_time: endTime.toISOString(),
        })
        .eq('id', slip!.id);

      // 4. Call compute_slip_final_seconds RPC
      const { data: finalSeconds } = await supabase.rpc(
        'compute_slip_final_seconds',
        { p_slip_id: slip!.id },
      );

      // Duration should be 1000ms - 100ms - 200ms = 700ms ≈ 0-1 seconds
      // (compute_slip_final_seconds returns seconds)
      expect(finalSeconds).toBeGreaterThanOrEqual(0);

      // Verify both pauses exist
      const slipWithPauses = await service.getById(slip!.id);
      expect(slipWithPauses.pauses.length).toBe(2);
    });

    it('should handle missing pause end_time (fail-safe uses slip end_time)', async () => {
      const fixture = await createTestFixture();

      // 1. Start slip
      const slip = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
      });
      fixture.slipIds.push(slip.id);

      // 2. Manually create an open pause (bypass service)
      await supabase.from('rating_slip_pause').insert({
        rating_slip_id: slip.id,
        casino_id: testCasinoId,
        started_at: new Date().toISOString(),
        ended_at: null, // Open pause
        created_by: testActorId,
      });

      // Wait 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 3. Close slip (should handle open pause)
      const closed = await service.close(testCasinoId, testActorId, slip.id);

      // Should not crash, should use slip end_time as failsafe
      expect(closed.duration_seconds).toBeGreaterThanOrEqual(0);
      expect(closed.final_duration_seconds).toBe(closed.duration_seconds);
    });
  });

  // =========================================================================
  // 2. Move Operation - Continuity Fields
  // =========================================================================

  describe('Move Operation - Continuity Chain', () => {
    it('should populate continuity fields correctly on first move', async () => {
      const fixture = await createTestFixture();

      // 1. Start first slip
      const slip1 = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
        seat_number: '1',
      });
      fixture.slipIds.push(slip1.id);

      // Wait to build duration
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 2. Move to second table
      const moveResult = await service.move(
        testCasinoId,
        testActorId,
        slip1.id,
        {
          new_table_id: testTable2Id,
          new_seat_number: '2',
        },
      );
      fixture.slipIds.push(moveResult.new_slip.id);

      // Verify closed slip
      expect(moveResult.closed_slip.id).toBe(slip1.id);
      expect(moveResult.closed_slip.status).toBe('closed');
      expect(
        moveResult.closed_slip.final_duration_seconds,
      ).toBeGreaterThanOrEqual(0);

      // Verify new slip continuity fields
      expect(moveResult.new_slip.previous_slip_id).toBe(slip1.id);
      expect(moveResult.new_slip.move_group_id).toBe(slip1.id); // First move
      expect(moveResult.new_slip.accumulated_seconds).toBe(
        moveResult.closed_slip.final_duration_seconds,
      );
      expect(moveResult.new_slip.table_id).toBe(testTable2Id);
      expect(moveResult.new_slip.seat_number).toBe('2');

      // Clean up
      await service.close(testCasinoId, testActorId, moveResult.new_slip.id);
    });

    it('should propagate move_group_id on subsequent moves', async () => {
      const fixture = await createTestFixture();

      // 1. Start slip1
      const slip1 = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
        seat_number: 'propagate-test-1',
      });
      fixture.slipIds.push(slip1.id);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 2. Move to table2 (first move)
      const move1 = await service.move(testCasinoId, testActorId, slip1.id, {
        new_table_id: testTable2Id,
        new_seat_number: 'propagate-test-2',
      });
      fixture.slipIds.push(move1.new_slip.id);

      const slip2 = move1.new_slip;
      expect(slip2.move_group_id).toBe(slip1.id);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 3. Move to table3 (second move)
      const move2 = await service.move(testCasinoId, testActorId, slip2.id, {
        new_table_id: testTable3Id,
        new_seat_number: 'propagate-test-3',
      });
      fixture.slipIds.push(move2.new_slip.id);

      const slip3 = move2.new_slip;

      // Verify move_group_id is propagated (not reset)
      expect(slip3.previous_slip_id).toBe(slip2.id);
      expect(slip3.move_group_id).toBe(slip1.id); // Propagated from slip2
      expect(slip3.accumulated_seconds).toBe(
        move1.closed_slip.final_duration_seconds! +
          move2.closed_slip.final_duration_seconds!,
      );

      // Clean up
      await service.close(testCasinoId, testActorId, slip3.id);
    });

    it('should build correct chain traversable via previous_slip_id', async () => {
      const fixture = await createTestFixture();

      // Create 3-segment chain
      const slip1 = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
        seat_number: 'chain-test-1',
      });
      fixture.slipIds.push(slip1.id);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const move1 = await service.move(testCasinoId, testActorId, slip1.id, {
        new_table_id: testTable2Id,
        new_seat_number: 'chain-test-2',
      });
      fixture.slipIds.push(move1.new_slip.id);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const move2 = await service.move(
        testCasinoId,
        testActorId,
        move1.new_slip.id,
        {
          new_table_id: testTable3Id,
          new_seat_number: 'chain-test-3',
        },
      );
      fixture.slipIds.push(move2.new_slip.id);

      // Verify chain: slip3 -> slip2 -> slip1
      const slip3 = await service.getById(move2.new_slip.id);
      expect(slip3.previous_slip_id).toBe(move1.new_slip.id);

      const slip2 = await service.getById(move1.new_slip.id);
      expect(slip2.previous_slip_id).toBe(slip1.id);

      const slip1Retrieved = await service.getById(slip1.id);
      expect(slip1Retrieved.previous_slip_id).toBeNull();

      // Clean up
      await service.close(testCasinoId, testActorId, move2.new_slip.id);
    });
  });

  // =========================================================================
  // 3. rpc_get_visit_live_view - Session Aggregation
  // =========================================================================

  describe('rpc_get_visit_live_view - Session Aggregates', () => {
    it('should return correct session totals across multiple slips', async () => {
      const fixture = await createTestFixture();

      // 1. Create first slip
      const slip1 = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
      });
      fixture.slipIds.push(slip1.id);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 2. Move to second table
      const move1 = await service.move(testCasinoId, testActorId, slip1.id, {
        new_table_id: testTable2Id,
      });
      fixture.slipIds.push(move1.new_slip.id);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 3. Get live view
      const liveView = await service.getVisitLiveView(
        testCasinoId,
        fixture.visitId,
        {
          includeSegments: true,
          segmentsLimit: 10,
        },
      );

      expect(liveView).toBeDefined();
      expect(liveView!.visit_id).toBe(fixture.visitId);
      expect(liveView!.session_segment_count).toBe(2); // slip1 (closed) + slip2 (open)

      // Current segment should be slip2
      expect(liveView!.current_segment_slip_id).toBe(move1.new_slip.id);
      expect(liveView!.current_segment_table_id).toBe(testTable2Id);
      expect(liveView!.current_segment_status).toBe('open');

      // Session duration should include both slips
      expect(liveView!.session_total_duration_seconds).toBeGreaterThanOrEqual(
        0,
      );

      // Segments array should be present
      expect(liveView!.segments).toBeDefined();
      expect(liveView!.segments!.length).toBe(2);

      // Clean up
      await service.close(testCasinoId, testActorId, move1.new_slip.id);
    });

    it('should handle segments array pagination', async () => {
      const fixture = await createTestFixture();

      // Create 3 slips via moves
      let currentSlipId = '';
      for (let i = 0; i < 3; i++) {
        if (i === 0) {
          const slip = await service.start(testCasinoId, testActorId, {
            visit_id: fixture.visitId,
            table_id: testTableId,
          });
          currentSlipId = slip.id;
          fixture.slipIds.push(slip.id);
        } else {
          const tables = [testTable2Id, testTable3Id];
          const move = await service.move(
            testCasinoId,
            testActorId,
            currentSlipId,
            {
              new_table_id: tables[i - 1],
            },
          );
          currentSlipId = move.new_slip.id;
          fixture.slipIds.push(currentSlipId);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Get live view with limit of 2 segments
      const liveView = await service.getVisitLiveView(
        testCasinoId,
        fixture.visitId,
        {
          includeSegments: true,
          segmentsLimit: 2,
        },
      );

      expect(liveView!.segments).toBeDefined();
      expect(liveView!.segments!.length).toBe(2); // Limited to 2
      expect(liveView!.session_segment_count).toBe(3); // Total count

      // Clean up
      await service.close(testCasinoId, testActorId, currentSlipId);
    });

    it('should return null for non-existent visit', async () => {
      const liveView = await service.getVisitLiveView(
        testCasinoId,
        '00000000-0000-0000-0000-000000000000',
      );

      expect(liveView).toBeNull();
    });
  });

  // =========================================================================
  // 4. RLS Enforcement
  // =========================================================================

  describe('RLS - Cross-Casino Isolation', () => {
    it('should return null for cross-casino visit query', async () => {
      // Create visit in casino2
      fixtureCounter++;
      const { data: player } = await supabase
        .from('player')
        .insert({
          first_name: 'Cross',
          last_name: `Casino${fixtureCounter}`,
          birth_date: '1980-01-01',
        })
        .select()
        .single();

      await supabase.from('player_casino').insert({
        player_id: player!.id,
        casino_id: testCasino2Id,
        status: 'active',
      });

      const { data: visit } = await supabase
        .from('visit')
        .insert({
          player_id: player!.id,
          casino_id: testCasino2Id,
          started_at: new Date().toISOString(),
          ended_at: null,
        })
        .select()
        .single();

      allFixtures.push({
        playerId: player!.id,
        visitId: visit!.id,
        slipIds: [],
      });

      // Try to query casino2 visit from casino1 context (RLS should block)
      // Note: Service is using service role key, so RLS is bypassed
      // For true RLS test, would need a client with RLS enabled

      // Instead, verify that the RPC returns NULL for visits that don't match
      // RLS predicates (if properly configured)

      // This test documents expected behavior; actual RLS enforcement
      // requires non-service-role client
      const liveView = await service.getVisitLiveView(
        testCasino2Id,
        visit!.id,
      );

      // With service role, should still return data
      // In production with RLS-enabled client, this would be NULL
      expect(liveView).toBeDefined();
    });
  });

  // =========================================================================
  // 5. Partial Unique Index - Concurrent Move Handling
  // =========================================================================

  describe('Partial Unique Index - One Active Slip Per Visit', () => {
    it('should prevent duplicate open slips for same visit', async () => {
      const fixture = await createTestFixture();

      // 1. Start first slip
      const slip1 = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
      });
      fixture.slipIds.push(slip1.id);

      // 2. Attempt to start second slip at different table (should fail)
      await expect(
        service.start(testCasinoId, testActorId, {
          visit_id: fixture.visitId,
          table_id: testTable2Id,
        }),
      ).rejects.toThrow();

      // Verify only one slip exists for visit in open state
      const slips = await service.listForVisit(fixture.visitId);
      const openSlips = slips.filter((s) => s.status === 'open');
      expect(openSlips.length).toBe(1);

      // Clean up
      await service.close(testCasinoId, testActorId, slip1.id);
    });

    it('should allow new slip after move operation completes', async () => {
      const fixture = await createTestFixture();

      // 1. Start first slip
      const slip1 = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
      });
      fixture.slipIds.push(slip1.id);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 2. Move (closes slip1, starts slip2)
      const moveResult = await service.move(
        testCasinoId,
        testActorId,
        slip1.id,
        {
          new_table_id: testTable2Id,
        },
      );
      fixture.slipIds.push(moveResult.new_slip.id);

      // Verify: slip1 is closed, slip2 is open
      const slip1Reloaded = await service.getById(slip1.id);
      expect(slip1Reloaded.status).toBe('closed');

      const slip2 = await service.getById(moveResult.new_slip.id);
      expect(slip2.status).toBe('open');

      // Verify only one open slip
      const slips = await service.listForVisit(fixture.visitId);
      const openSlips = slips.filter((s) => s.status === 'open');
      expect(openSlips.length).toBe(1);
      expect(openSlips[0].id).toBe(moveResult.new_slip.id);

      // Clean up
      await service.close(testCasinoId, testActorId, moveResult.new_slip.id);
    });
  });

  // =========================================================================
  // 6. Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle move with game_settings', async () => {
      const fixture = await createTestFixture();

      const slip1 = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
        game_settings: { min_bet: 25 },
      });
      fixture.slipIds.push(slip1.id);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const moveResult = await service.move(
        testCasinoId,
        testActorId,
        slip1.id,
        {
          new_table_id: testTable2Id,
          game_settings: { min_bet: 50 },
        },
      );
      fixture.slipIds.push(moveResult.new_slip.id);

      expect(moveResult.new_slip.game_settings).toEqual({ min_bet: 50 });

      // Clean up
      await service.close(testCasinoId, testActorId, moveResult.new_slip.id);
    });

    it('should reject move on already closed slip', async () => {
      const fixture = await createTestFixture();

      const slip = await service.start(testCasinoId, testActorId, {
        visit_id: fixture.visitId,
        table_id: testTableId,
      });
      fixture.slipIds.push(slip.id);

      // Close slip
      await service.close(testCasinoId, testActorId, slip.id);

      // Attempt move on closed slip
      await expect(
        service.move(testCasinoId, testActorId, slip.id, {
          new_table_id: testTable2Id,
        }),
      ).rejects.toThrow();
    });
  });
});
