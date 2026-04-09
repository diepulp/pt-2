/** @jest-environment node */

/**
 * Visit Continuation Integration Tests (PRD-017)
 *
 * Tests visit continuation features against real Supabase database.
 * Validates database-level behavior including:
 * - visit_group_id trigger (defaults to id on INSERT)
 * - idx_visit_one_open_per_player partial unique index
 * - RPC functions (rpc_get_player_recent_sessions, rpc_get_player_last_session_context)
 * - Cross-casino RLS enforcement
 * - Start from previous endpoint end-to-end flow
 * - Policy snapshot (game_settings from CURRENT table, not source)
 *
 * @see PRD-017 Start From Previous Session
 * @see supabase/migrations/20251222015000_prd017_visit_continuation.sql
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createModeCSession,
  ModeCSessionResult,
} from '@/lib/testing/create-mode-c-session';
import type { Database } from '@/types/database.types';

import { createVisitService, VisitServiceInterface } from '../index';

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Shared test fixtures
const TEST_RUN_ID = Date.now().toString(36);
const TEST_PREFIX = `prd017-${TEST_RUN_ID}`;

interface TestFixture {
  playerId: string;
  visitIds: string[];
  slipIds: string[];
}

describe('Visit Continuation - Integration Tests (PRD-017)', () => {
  let setupClient: SupabaseClient<Database>;
  let pitBossClient: SupabaseClient<Database>;
  let service: VisitServiceInterface;
  let authCleanup1: () => Promise<void>;
  let authCleanup2: () => Promise<void>;

  // Shared test resources
  let testCompany1Id: string;
  let testCompany2Id: string;
  let testCasino1Id: string;
  let testCasino2Id: string;
  let testTable1Id: string;
  let testTable2Id: string;
  let testTable3Id: string;
  let testActor1Id: string;
  let testActor2Id: string;

  // Track all created fixtures for cleanup
  const allFixtures: TestFixture[] = [];
  let fixtureCounter = 0;

  beforeAll(async () => {
    // Service role for fixture setup only (Mode C — ADR-024)
    setupClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test companies (ADR-043: company before casino)
    const { data: company1 } = await setupClient
      .from('company')
      .insert({ name: `${TEST_PREFIX} Company 1` })
      .select()
      .single();
    if (!company1) throw new Error('Failed to create test company 1');
    testCompany1Id = company1.id;

    const { data: company2 } = await setupClient
      .from('company')
      .insert({ name: `${TEST_PREFIX} Company 2` })
      .select()
      .single();
    if (!company2) throw new Error('Failed to create test company 2');
    testCompany2Id = company2.id;

    // Create test casinos
    const { data: casino1 } = await setupClient
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino 1`,
        status: 'active',
        company_id: testCompany1Id,
      })
      .select()
      .single();
    testCasino1Id = casino1!.id;

    const { data: casino2 } = await setupClient
      .from('casino')
      .insert({
        name: `${TEST_PREFIX} Casino 2`,
        status: 'active',
        company_id: testCompany2Id,
      })
      .select()
      .single();
    testCasino2Id = casino2!.id;

    // Create casino settings (required for compute_gaming_day)
    await setupClient.from('casino_settings').insert([
      {
        casino_id: testCasino1Id,
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

    // Create gaming tables
    const { data: table1 } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: testCasino1Id,
        label: `${TEST_PREFIX}-BJ-01`,
        pit: 'Main',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();
    testTable1Id = table1!.id;

    const { data: table2 } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: testCasino1Id,
        label: `${TEST_PREFIX}-BJ-02`,
        pit: 'Main',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();
    testTable2Id = table2!.id;

    const { data: table3 } = await setupClient
      .from('gaming_table')
      .insert({
        casino_id: testCasino2Id,
        label: `${TEST_PREFIX}-BJ-03`,
        pit: 'Main',
        type: 'blackjack',
        status: 'active',
      })
      .select()
      .single();
    testTable3Id = table3!.id;

    // Create test actors (staff)
    const { data: actor1 } = await setupClient
      .from('staff')
      .insert({
        casino_id: testCasino1Id,
        employee_id: `${TEST_PREFIX}-A1`,
        first_name: 'Test',
        last_name: 'Actor1',
        email: `${TEST_PREFIX}-actor1@test.com`,
        role: 'pit_boss',
        status: 'active',
      })
      .select()
      .single();
    testActor1Id = actor1!.id;

    const { data: actor2 } = await setupClient
      .from('staff')
      .insert({
        casino_id: testCasino2Id,
        employee_id: `${TEST_PREFIX}-A2`,
        first_name: 'Test',
        last_name: 'Actor2',
        email: `${TEST_PREFIX}-actor2@test.com`,
        role: 'pit_boss',
        status: 'active',
      })
      .select()
      .single();
    testActor2Id = actor2!.id;

    // Mode C auth setup (ADR-024) — authenticated anon clients with JWT claims
    const session1 = await createModeCSession(setupClient, {
      staffId: testActor1Id,
      casinoId: testCasino1Id,
      staffRole: 'pit_boss',
    });
    pitBossClient = session1.client;
    authCleanup1 = session1.cleanup;
    await setupClient
      .from('staff')
      .update({ user_id: session1.userId })
      .eq('id', testActor1Id);

    const session2 = await createModeCSession(setupClient, {
      staffId: testActor2Id,
      casinoId: testCasino2Id,
      staffRole: 'pit_boss',
    });
    authCleanup2 = session2.cleanup;
    await setupClient
      .from('staff')
      .update({ user_id: session2.userId })
      .eq('id', testActor2Id);

    // Wire service to authenticated client (Mode C)
    service = createVisitService(pitBossClient);
  });

  afterAll(async () => {
    // Clean up fixtures
    for (const fixture of allFixtures) {
      // Delete rating slips
      for (const slipId of fixture.slipIds) {
        await setupClient.from('rating_slip').delete().eq('id', slipId);
      }

      // Delete visits
      for (const visitId of fixture.visitIds) {
        await setupClient.from('rating_slip').delete().eq('visit_id', visitId);
        await setupClient.from('visit').delete().eq('id', visitId);
      }

      // Delete player
      if (fixture.playerId) {
        await setupClient
          .from('player_casino')
          .delete()
          .eq('player_id', fixture.playerId);
        await setupClient
          .from('player_loyalty')
          .delete()
          .eq('player_id', fixture.playerId);
        await setupClient.from('player').delete().eq('id', fixture.playerId);
      }
    }

    // Delete test resources
    await setupClient.from('staff').delete().eq('casino_id', testCasino1Id);
    await setupClient.from('staff').delete().eq('casino_id', testCasino2Id);
    await setupClient
      .from('gaming_table')
      .delete()
      .eq('casino_id', testCasino1Id);
    await setupClient
      .from('gaming_table')
      .delete()
      .eq('casino_id', testCasino2Id);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasino1Id);
    await setupClient
      .from('casino_settings')
      .delete()
      .eq('casino_id', testCasino2Id);
    await setupClient.from('casino').delete().eq('id', testCasino1Id);
    await setupClient.from('casino').delete().eq('id', testCasino2Id);
    await setupClient.from('company').delete().eq('id', testCompany1Id);
    await setupClient.from('company').delete().eq('id', testCompany2Id);
    // Auth cleanup (Mode C)
    await authCleanup1?.();
    await authCleanup2?.();
  }, 30000);

  // Helper: Create isolated test fixture
  async function createTestFixture(
    casinoId: string = testCasino1Id,
  ): Promise<TestFixture> {
    fixtureCounter++;

    const { data: player } = await setupClient
      .from('player')
      .insert({
        first_name: 'Test',
        last_name: `Player${fixtureCounter}`,
        birth_date: '1990-01-01',
      })
      .select()
      .single();

    await setupClient.from('player_casino').insert({
      player_id: player!.id,
      casino_id: casinoId,
      status: 'active',
    });

    const fixture: TestFixture = {
      playerId: player!.id,
      visitIds: [],
      slipIds: [],
    };

    allFixtures.push(fixture);
    return fixture;
  }

  // Fixture helpers — Mode C RPC wrappers (ADR-024: business RPCs via authenticated client)
  async function setupStartSlip(
    visitId: string,
    tableId: string,
    seat: string,
    gameSettings: Record<string, unknown> = {},
  ) {
    const { data, error } = await pitBossClient.rpc('rpc_start_rating_slip', {
      p_visit_id: visitId,
      p_table_id: tableId,
      p_seat_number: seat,
      p_game_settings: gameSettings,
    });
    if (error) throw error;
    return data!;
  }

  async function setupCloseSlip(slipId: string, averageBet?: number) {
    const params: Record<string, unknown> = { p_rating_slip_id: slipId };
    if (averageBet !== undefined) params.p_average_bet = averageBet;
    const { error } = await pitBossClient.rpc('rpc_close_rating_slip', params);
    if (error) throw error;
  }

  async function setupCreateVisit(
    playerId: string | null,
    casinoId: string,
    overrides: Partial<{
      started_at: string;
      ended_at: string | null;
      visit_group_id: string;
      visit_kind: string;
    }> = {},
  ) {
    const { data, error } = await setupClient
      .from('visit')
      .insert({
        player_id: playerId,
        casino_id: casinoId,
        visit_kind:
          (overrides.visit_kind as 'gaming_identified_rated') ??
          'gaming_identified_rated',
        started_at: overrides.started_at,
        ended_at: overrides.ended_at ?? null,
        visit_group_id: overrides.visit_group_id,
      })
      .select()
      .single();
    return { data: data!, error };
  }

  async function setupUpdateVisit(
    visitId: string,
    updates: Record<string, unknown>,
  ) {
    const { error } = await setupClient
      .from('visit')
      .update(updates)
      .eq('id', visitId);
    if (error) throw error;
  }

  // ===========================================================================
  // 1. visit_group_id Trigger Tests
  // ===========================================================================

  describe('visit_group_id trigger', () => {
    it('sets visit_group_id = id when NULL on INSERT', async () => {
      const fixture = await createTestFixture();

      // Create visit without explicit visit_group_id
      const { data: visit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
      );

      fixture.visitIds.push(visit.id);

      // Trigger should set visit_group_id = id
      expect(visit.visit_group_id).toBe(visit.id);
    });

    it('preserves visit_group_id when explicitly provided', async () => {
      const fixture = await createTestFixture();

      const explicitGroupId = '00000000-0000-4000-a000-000000000123';

      // Create visit with explicit visit_group_id
      const { data: visit, error } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          visit_group_id: explicitGroupId,
        },
      );

      // Trigger should NOT override explicit value
      expect(error).toBeNull();
      expect(visit.visit_group_id).toBe(explicitGroupId);

      fixture.visitIds.push(visit.id);
    });
  });

  // ===========================================================================
  // 2. idx_visit_one_open_per_player Constraint Tests
  // ===========================================================================

  describe('idx_visit_one_open_per_player constraint', () => {
    it('allows one open visit per player', async () => {
      const fixture = await createTestFixture();

      const { data: visit1, error: error1 } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );

      expect(error1).toBeNull();
      expect(visit1.ended_at).toBeNull();
      fixture.visitIds.push(visit1.id);
    });

    it('rejects second open visit for same player (constraint violation)', async () => {
      const fixture = await createTestFixture();

      // Create first open visit
      const { data: visit1 } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture.visitIds.push(visit1.id);

      // Attempt to create second open visit
      const { error: error2 } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );

      // Should fail with unique violation
      expect(error2).not.toBeNull();
      expect(error2!.code).toBe('23505'); // Unique violation
    });

    it('allows open visits for different players', async () => {
      const fixture1 = await createTestFixture();
      const fixture2 = await createTestFixture();

      // Create open visit for player 1
      const { data: visit1, error: error1 } = await setupCreateVisit(
        fixture1.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture1.visitIds.push(visit1.id);

      // Create open visit for player 2
      const { data: visit2, error: error2 } = await setupCreateVisit(
        fixture2.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture2.visitIds.push(visit2.id);

      // Both should succeed
      expect(error1).toBeNull();
      expect(error2).toBeNull();
      expect(visit1.player_id).not.toBe(visit2.player_id);
    });

    it('allows ghost visits (player_id NULL) to coexist', async () => {
      // Create multiple ghost visits (no player_id)
      const { data: ghost1, error: error1 } = await setupCreateVisit(
        null,
        testCasino1Id,
        {
          visit_kind: 'gaming_ghost_unrated',
          ended_at: null,
        },
      );

      const { data: ghost2, error: error2 } = await setupCreateVisit(
        null,
        testCasino1Id,
        {
          visit_kind: 'gaming_ghost_unrated',
          ended_at: null,
        },
      );

      // Both should succeed (partial unique index excludes NULL player_id)
      expect(error1).toBeNull();
      expect(error2).toBeNull();

      // Cleanup
      await setupClient.from('visit').delete().eq('id', ghost1!.id);
      await setupClient.from('visit').delete().eq('id', ghost2!.id);
    });

    it('allows new open visit after previous is closed', async () => {
      const fixture = await createTestFixture();

      // Create and close first visit
      const { data: visit1 } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture.visitIds.push(visit1.id);

      await setupUpdateVisit(visit1.id, { ended_at: new Date().toISOString() });

      // Create new open visit
      const { data: visit2, error: error2 } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture.visitIds.push(visit2.id);

      // Should succeed
      expect(error2).toBeNull();
      expect(visit2.ended_at).toBeNull();
    });
  });

  // ===========================================================================
  // 3. rpc_get_player_recent_sessions Tests
  // ===========================================================================

  describe('rpc_get_player_recent_sessions', () => {
    it('returns paginated closed sessions', async () => {
      const fixture = await createTestFixture();

      // Create 3 visits: open first, add slips, then close
      for (let i = 0; i < 3; i++) {
        const startedAt = new Date(
          Date.now() - (3 - i) * 3600000,
        ).toISOString();
        const endedAt = new Date(
          Date.now() - (3 - i) * 3600000 + 7200000,
        ).toISOString();

        // Create visit as open first
        const { data: visit } = await setupCreateVisit(
          fixture.playerId,
          testCasino1Id,
          { started_at: startedAt },
        );
        fixture.visitIds.push(visit.id);

        // Create a rating slip while visit is open
        const slip = await setupStartSlip(visit.id, testTable1Id, '1');
        fixture.slipIds.push(slip.id);

        // Close the slip, then close the visit
        await setupCloseSlip(slip.id);
        await setupUpdateVisit(visit.id, { ended_at: endedAt });
      }

      const result = await service.getPlayerRecentSessions(
        testCasino1Id,
        fixture.playerId,
        { limit: 2 },
      );

      expect(result.sessions).toHaveLength(2);
      expect(result.next_cursor).not.toBeNull(); // More sessions available
      expect(result.open_visit).toBeNull();
    });

    it('uses cursor-based pagination with tie-breaking', async () => {
      const fixture = await createTestFixture();

      // Create 5 closed visits
      for (let i = 0; i < 5; i++) {
        const { data: visit } = await setupCreateVisit(
          fixture.playerId,
          testCasino1Id,
          {
            started_at: new Date(Date.now() - (5 - i) * 3600000).toISOString(),
            ended_at: new Date(
              Date.now() - (5 - i) * 3600000 + 3600000,
            ).toISOString(),
          },
        );
        fixture.visitIds.push(visit.id);
      }

      // Get first page
      const page1 = await service.getPlayerRecentSessions(
        testCasino1Id,
        fixture.playerId,
        { limit: 3 },
      );

      expect(page1.sessions).toHaveLength(3);
      expect(page1.next_cursor).not.toBeNull();

      // Get second page using cursor
      const page2 = await service.getPlayerRecentSessions(
        testCasino1Id,
        fixture.playerId,
        { limit: 3, cursor: page1.next_cursor! },
      );

      expect(page2.sessions).toHaveLength(2);
      expect(page2.next_cursor).toBeNull(); // No more pages
    });

    it('excludes open visits from sessions list', async () => {
      const fixture = await createTestFixture();

      // Create 2 closed visits
      for (let i = 0; i < 2; i++) {
        const { data: visit } = await setupCreateVisit(
          fixture.playerId,
          testCasino1Id,
          {
            started_at: new Date(Date.now() - (3 - i) * 3600000).toISOString(),
            ended_at: new Date(
              Date.now() - (3 - i) * 3600000 + 3600000,
            ).toISOString(),
          },
        );
        fixture.visitIds.push(visit.id);
      }

      // Create 1 open visit
      const { data: openVisit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture.visitIds.push(openVisit.id);

      const result = await service.getPlayerRecentSessions(
        testCasino1Id,
        fixture.playerId,
      );

      // Open visit should NOT be in sessions array
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.every((s) => s.ended_at !== null)).toBe(true);

      // Open visit returned separately
      expect(result.open_visit).not.toBeNull();
      expect(result.open_visit!.visit_id).toBe(openVisit.id);
    });

    it('returns open_visit separately', async () => {
      const fixture = await createTestFixture();

      // Create open visit only (no closed sessions)
      const { data: openVisit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture.visitIds.push(openVisit.id);

      // Create a rating slip for the open visit
      const slip = await setupStartSlip(openVisit.id, testTable1Id, '1');
      fixture.slipIds.push(slip.id);

      const result = await service.getPlayerRecentSessions(
        testCasino1Id,
        fixture.playerId,
      );

      expect(result.sessions).toHaveLength(0);
      expect(result.open_visit).not.toBeNull();
      expect(result.open_visit!.ended_at).toBeNull();
      expect(result.open_visit!.segment_count).toBe(1);
    });

    it('cross-casino query returns empty due to RLS', async () => {
      const fixture = await createTestFixture(testCasino1Id);

      // Create visit in casino 1
      const { data: visit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture.visitIds.push(visit.id);

      // Query from casino 2 context (RLS should block)
      // Note: Service role bypasses RLS, so we test the RPC filter instead
      const result = await service.getPlayerRecentSessions(
        testCasino2Id, // Different casino
        fixture.playerId,
      );

      // Should return empty (casino_id filter in RPC)
      expect(result.sessions).toHaveLength(0);
      expect(result.open_visit).toBeNull();
    });
  });

  // ===========================================================================
  // 4. rpc_get_player_last_session_context Tests
  // ===========================================================================

  describe('rpc_get_player_last_session_context', () => {
    it('returns last closed session context', async () => {
      const fixture = await createTestFixture();

      // Create 2 closed visits
      const { data: visit1 } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          started_at: new Date(Date.now() - 7200000).toISOString(),
          ended_at: new Date(Date.now() - 3600000).toISOString(),
        },
      );
      fixture.visitIds.push(visit1.id);

      const slip1 = await setupStartSlip(visit1.id, testTable1Id, '3', {
        min_bet: 25,
      });
      fixture.slipIds.push(slip1.id);

      await setupCloseSlip(slip1.id, 50.0);

      // Create more recent visit
      const { data: visit2 } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          started_at: new Date(Date.now() - 1800000).toISOString(),
          ended_at: new Date(Date.now() - 900000).toISOString(),
        },
      );
      fixture.visitIds.push(visit2.id);

      const slip2 = await setupStartSlip(visit2.id, testTable2Id, '5', {
        min_bet: 50,
      });
      fixture.slipIds.push(slip2.id);

      await setupCloseSlip(slip2.id, 75.0);

      const result = await service.getPlayerLastSessionContext(
        testCasino1Id,
        fixture.playerId,
      );

      // Should return most recent (visit2)
      expect(result).not.toBeNull();
      expect(result!.visit_id).toBe(visit2.id);
      expect(result!.last_table_id).toBe(testTable2Id);
      expect(result!.last_seat_number).toBe(5);
      expect(result!.last_average_bet).toBe(75.0);
    });

    it('returns null for player with no sessions', async () => {
      const fixture = await createTestFixture();

      const result = await service.getPlayerLastSessionContext(
        testCasino1Id,
        fixture.playerId,
      );

      expect(result).toBeNull();
    });

    it('respects RLS - blocked cross-casino', async () => {
      const fixture = await createTestFixture(testCasino1Id);

      // Create visit in casino 1
      const { data: visit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture.visitIds.push(visit.id);

      const slip = await setupStartSlip(visit.id, testTable1Id, '1');
      fixture.slipIds.push(slip.id);

      await setupCloseSlip(slip.id);

      // Query from casino 2 (should return null due to RPC filter)
      const result = await service.getPlayerLastSessionContext(
        testCasino2Id,
        fixture.playerId,
      );

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // 5. Start From Previous - Happy Path
  // ===========================================================================

  describe('POST /api/v1/visits/start-from-previous', () => {
    it('creates visit with correct visit_group_id (happy path)', async () => {
      const fixture = await createTestFixture();

      // Create and close source visit
      const { data: sourceVisit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture.visitIds.push(sourceVisit.id);

      const sourceSlip = await setupStartSlip(
        sourceVisit.id,
        testTable1Id,
        '2',
        { min_bet: 25 },
      );
      fixture.slipIds.push(sourceSlip.id);

      await setupCloseSlip(sourceSlip.id);

      // Start from previous
      const result = await service.startFromPrevious(
        testCasino1Id,
        testActor1Id,
        {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 3,
        },
      );

      fixture.visitIds.push(result.visit_id);
      fixture.slipIds.push(result.active_slip_id);

      // Verify new visit has correct visit_group_id
      expect(result.visit_group_id).toBe(sourceVisit.visit_group_id);

      // Verify new visit exists
      const { data: newVisit } = await setupClient
        .from('visit')
        .select('*')
        .eq('id', result.visit_id)
        .single();

      expect(newVisit!.visit_group_id).toBe(sourceVisit.visit_group_id);
      expect(newVisit!.player_id).toBe(fixture.playerId);
      expect(newVisit!.ended_at).toBeNull();
    });

    it('returns 409 when player has open visit', async () => {
      const fixture = await createTestFixture();

      // Create closed source visit
      const { data: sourceVisit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture.visitIds.push(sourceVisit.id);

      // Create open visit for same player
      const { data: openVisit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture.visitIds.push(openVisit.id);

      // Attempt to start from previous (should fail)
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 4,
        }),
      ).rejects.toThrow('already has an active visit');
    });

    it('returns 400 when source visit not closed', async () => {
      const fixture = await createTestFixture();

      // Create open source visit
      const { data: sourceVisit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: null, // Still open
        },
      );
      fixture.visitIds.push(sourceVisit.id);

      // Attempt to start from previous
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 5,
        }),
      ).rejects.toThrow('Cannot continue from an open visit');
    });

    it('returns 400 when player_id mismatch', async () => {
      const fixture1 = await createTestFixture();
      const fixture2 = await createTestFixture();

      // Create closed visit for player 1
      const { data: visit1 } = await setupCreateVisit(
        fixture1.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture1.visitIds.push(visit1.id);

      // Attempt to start from previous with player 2
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture2.playerId, // Different player
          source_visit_id: visit1.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 6,
        }),
      ).rejects.toThrow('does not match request player_id');
    });

    it('returns 403 when cross-casino source', async () => {
      const fixture = await createTestFixture(testCasino1Id);

      // Create visit in casino 1
      const { data: visit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture.visitIds.push(visit.id);

      // Attempt to start from casino 2 context
      await expect(
        service.startFromPrevious(testCasino2Id, testActor2Id, {
          player_id: fixture.playerId,
          source_visit_id: visit.id,
          destination_table_id: testTable3Id,
          destination_seat_number: 1,
        }),
      ).rejects.toThrow('belongs to a different casino');
    });

    it('returns 422 when table not available', async () => {
      const fixture = await createTestFixture();

      // Create closed source visit
      const { data: sourceVisit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture.visitIds.push(sourceVisit.id);

      // Set table to inactive
      await setupClient
        .from('gaming_table')
        .update({ status: 'inactive' })
        .eq('id', testTable2Id);

      // Attempt to start from previous
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 7,
        }),
      ).rejects.toThrow('not available');

      // Restore table status
      await setupClient
        .from('gaming_table')
        .update({ status: 'active' })
        .eq('id', testTable2Id);
    });

    it('returns 422 when seat occupied', async () => {
      const fixture1 = await createTestFixture();
      const fixture2 = await createTestFixture();

      // Create closed source visit for player 1
      const { data: sourceVisit } = await setupCreateVisit(
        fixture1.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture1.visitIds.push(sourceVisit.id);

      // Create open visit for player 2 and occupy seat
      const { data: visit2 } = await setupCreateVisit(
        fixture2.playerId,
        testCasino1Id,
        {
          ended_at: null,
        },
      );
      fixture2.visitIds.push(visit2.id);

      const occupiedSlip = await setupStartSlip(visit2.id, testTable2Id, '8');
      fixture2.slipIds.push(occupiedSlip.id);

      // Attempt to start from previous at occupied seat
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture1.playerId,
          source_visit_id: sourceVisit.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 8, // Occupied
        }),
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // 6. Policy Snapshot Test
  // ===========================================================================

  describe('policy snapshot on continuation', () => {
    it('uses CURRENT policy not source policy when game_settings change', async () => {
      const fixture = await createTestFixture();

      // Create closed source visit with old game settings
      const { data: sourceVisit } = await setupCreateVisit(
        fixture.playerId,
        testCasino1Id,
        {
          ended_at: new Date().toISOString(),
        },
      );
      fixture.visitIds.push(sourceVisit.id);

      const sourceSlip = await setupStartSlip(
        sourceVisit.id,
        testTable1Id,
        '1',
        { min_bet: 10, max_bet: 100 },
      ); // Old settings
      fixture.slipIds.push(sourceSlip.id);

      await setupCloseSlip(sourceSlip.id);

      // Start from previous with NEW game settings
      const result = await service.startFromPrevious(
        testCasino1Id,
        testActor1Id,
        {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 2,
          game_settings_override: { min_bet: 25, max_bet: 500 }, // New settings
        },
      );

      fixture.visitIds.push(result.visit_id);
      fixture.slipIds.push(result.active_slip_id);

      // Verify new slip has NEW game settings (policy snapshot from CURRENT table)
      const { data: newSlip } = await setupClient
        .from('rating_slip')
        .select('game_settings')
        .eq('id', result.active_slip_id)
        .single();

      expect(newSlip!.game_settings).toEqual({ min_bet: 25, max_bet: 500 });
    });
  });
});
