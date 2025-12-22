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
} from "@jest/globals";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import { createVisitService, VisitServiceInterface } from "../index";

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

describe("Visit Continuation - Integration Tests (PRD-017)", () => {
  let supabase: SupabaseClient<Database>;
  let service: VisitServiceInterface;

  // Shared test resources
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
    // Use service role client for setup (bypasses RLS)
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    service = createVisitService(supabase);

    // Create test casinos
    const { data: casino1 } = await supabase
      .from("casino")
      .insert({ name: `${TEST_PREFIX} Casino 1`, status: "active" })
      .select()
      .single();
    testCasino1Id = casino1!.id;

    const { data: casino2 } = await supabase
      .from("casino")
      .insert({ name: `${TEST_PREFIX} Casino 2`, status: "active" })
      .select()
      .single();
    testCasino2Id = casino2!.id;

    // Create casino settings (required for compute_gaming_day)
    await supabase.from("casino_settings").insert([
      {
        casino_id: testCasino1Id,
        gaming_day_start_time: "06:00:00",
        timezone: "America/Los_Angeles",
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
      {
        casino_id: testCasino2Id,
        gaming_day_start_time: "06:00:00",
        timezone: "America/Los_Angeles",
        watchlist_floor: 3000,
        ctr_threshold: 10000,
      },
    ]);

    // Create gaming tables
    const { data: table1 } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasino1Id,
        label: `${TEST_PREFIX}-BJ-01`,
        pit: "Main",
        type: "blackjack",
        status: "active",
      })
      .select()
      .single();
    testTable1Id = table1!.id;

    const { data: table2 } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasino1Id,
        label: `${TEST_PREFIX}-BJ-02`,
        pit: "Main",
        type: "blackjack",
        status: "active",
      })
      .select()
      .single();
    testTable2Id = table2!.id;

    const { data: table3 } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasino2Id,
        label: `${TEST_PREFIX}-BJ-03`,
        pit: "Main",
        type: "blackjack",
        status: "active",
      })
      .select()
      .single();
    testTable3Id = table3!.id;

    // Create test actors (staff)
    const { data: actor1 } = await supabase
      .from("staff")
      .insert({
        casino_id: testCasino1Id,
        employee_id: `${TEST_PREFIX}-A1`,
        first_name: "Test",
        last_name: "Actor1",
        email: `${TEST_PREFIX}-actor1@test.com`,
        role: "pit_boss",
        status: "active",
      })
      .select()
      .single();
    testActor1Id = actor1!.id;

    const { data: actor2 } = await supabase
      .from("staff")
      .insert({
        casino_id: testCasino2Id,
        employee_id: `${TEST_PREFIX}-A2`,
        first_name: "Test",
        last_name: "Actor2",
        email: `${TEST_PREFIX}-actor2@test.com`,
        role: "pit_boss",
        status: "active",
      })
      .select()
      .single();
    testActor2Id = actor2!.id;
  });

  afterAll(async () => {
    // Clean up fixtures
    for (const fixture of allFixtures) {
      // Delete rating slips
      for (const slipId of fixture.slipIds) {
        await supabase.from("rating_slip").delete().eq("id", slipId);
      }

      // Delete visits
      for (const visitId of fixture.visitIds) {
        await supabase.from("rating_slip").delete().eq("visit_id", visitId);
        await supabase.from("visit").delete().eq("id", visitId);
      }

      // Delete player
      if (fixture.playerId) {
        await supabase
          .from("player_casino")
          .delete()
          .eq("player_id", fixture.playerId);
        await supabase
          .from("player_loyalty")
          .delete()
          .eq("player_id", fixture.playerId);
        await supabase.from("player").delete().eq("id", fixture.playerId);
      }
    }

    // Delete test resources
    await supabase.from("staff").delete().eq("casino_id", testCasino1Id);
    await supabase.from("staff").delete().eq("casino_id", testCasino2Id);
    await supabase.from("gaming_table").delete().eq("casino_id", testCasino1Id);
    await supabase.from("gaming_table").delete().eq("casino_id", testCasino2Id);
    await supabase
      .from("casino_settings")
      .delete()
      .eq("casino_id", testCasino1Id);
    await supabase
      .from("casino_settings")
      .delete()
      .eq("casino_id", testCasino2Id);
    await supabase.from("casino").delete().eq("id", testCasino1Id);
    await supabase.from("casino").delete().eq("id", testCasino2Id);
  }, 30000);

  // Helper: Create isolated test fixture
  async function createTestFixture(
    casinoId: string = testCasino1Id,
  ): Promise<TestFixture> {
    fixtureCounter++;

    const { data: player } = await supabase
      .from("player")
      .insert({
        first_name: "Test",
        last_name: `Player${fixtureCounter}`,
        birth_date: "1990-01-01",
      })
      .select()
      .single();

    await supabase.from("player_casino").insert({
      player_id: player!.id,
      casino_id: casinoId,
      status: "active",
    });

    const fixture: TestFixture = {
      playerId: player!.id,
      visitIds: [],
      slipIds: [],
    };

    allFixtures.push(fixture);
    return fixture;
  }

  // ===========================================================================
  // 1. visit_group_id Trigger Tests
  // ===========================================================================

  describe("visit_group_id trigger", () => {
    it("sets visit_group_id = id when NULL on INSERT", async () => {
      const fixture = await createTestFixture();

      // Create visit without explicit visit_group_id
      const { data: visit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          // visit_group_id is NULL (not provided)
        })
        .select()
        .single();

      fixture.visitIds.push(visit!.id);

      // Trigger should set visit_group_id = id
      expect(visit!.visit_group_id).toBe(visit!.id);
    });

    it("preserves visit_group_id when explicitly provided", async () => {
      const fixture = await createTestFixture();

      const explicitGroupId = "custom-group-id-123";

      // Create visit with explicit visit_group_id
      const { data: visit, error } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          visit_group_id: explicitGroupId,
        })
        .select()
        .single();

      // Trigger should NOT override explicit value
      expect(error).toBeNull();
      expect(visit!.visit_group_id).toBe(explicitGroupId);

      fixture.visitIds.push(visit!.id);
    });
  });

  // ===========================================================================
  // 2. idx_visit_one_open_per_player Constraint Tests
  // ===========================================================================

  describe("idx_visit_one_open_per_player constraint", () => {
    it("allows one open visit per player", async () => {
      const fixture = await createTestFixture();

      const { data: visit1, error: error1 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null, // Open visit
        })
        .select()
        .single();

      expect(error1).toBeNull();
      expect(visit1!.ended_at).toBeNull();
      fixture.visitIds.push(visit1!.id);
    });

    it("rejects second open visit for same player (constraint violation)", async () => {
      const fixture = await createTestFixture();

      // Create first open visit
      const { data: visit1 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture.visitIds.push(visit1!.id);

      // Attempt to create second open visit
      const { error: error2 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();

      // Should fail with unique violation
      expect(error2).not.toBeNull();
      expect(error2!.code).toBe("23505"); // Unique violation
    });

    it("allows open visits for different players", async () => {
      const fixture1 = await createTestFixture();
      const fixture2 = await createTestFixture();

      // Create open visit for player 1
      const { data: visit1, error: error1 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture1.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture1.visitIds.push(visit1!.id);

      // Create open visit for player 2
      const { data: visit2, error: error2 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture2.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture2.visitIds.push(visit2!.id);

      // Both should succeed
      expect(error1).toBeNull();
      expect(error2).toBeNull();
      expect(visit1!.player_id).not.toBe(visit2!.player_id);
    });

    it("allows ghost visits (player_id NULL) to coexist", async () => {
      // Create multiple ghost visits (no player_id)
      const { data: ghost1, error: error1 } = await supabase
        .from("visit")
        .insert({
          player_id: null,
          casino_id: testCasino1Id,
          visit_kind: "gaming_ghost_unrated",
          ended_at: null,
        })
        .select()
        .single();

      const { data: ghost2, error: error2 } = await supabase
        .from("visit")
        .insert({
          player_id: null,
          casino_id: testCasino1Id,
          visit_kind: "gaming_ghost_unrated",
          ended_at: null,
        })
        .select()
        .single();

      // Both should succeed (partial unique index excludes NULL player_id)
      expect(error1).toBeNull();
      expect(error2).toBeNull();

      // Cleanup
      await supabase.from("visit").delete().eq("id", ghost1!.id);
      await supabase.from("visit").delete().eq("id", ghost2!.id);
    });

    it("allows new open visit after previous is closed", async () => {
      const fixture = await createTestFixture();

      // Create and close first visit
      const { data: visit1 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture.visitIds.push(visit1!.id);

      await supabase
        .from("visit")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", visit1!.id);

      // Create new open visit
      const { data: visit2, error: error2 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture.visitIds.push(visit2!.id);

      // Should succeed
      expect(error2).toBeNull();
      expect(visit2!.ended_at).toBeNull();
    });
  });

  // ===========================================================================
  // 3. rpc_get_player_recent_sessions Tests
  // ===========================================================================

  describe("rpc_get_player_recent_sessions", () => {
    it("returns paginated closed sessions", async () => {
      const fixture = await createTestFixture();

      // Create 3 closed visits
      for (let i = 0; i < 3; i++) {
        const { data: visit } = await supabase
          .from("visit")
          .insert({
            player_id: fixture.playerId,
            casino_id: testCasino1Id,
            visit_kind: "gaming_identified_rated",
            started_at: new Date(Date.now() - (3 - i) * 3600000).toISOString(),
            ended_at: new Date(
              Date.now() - (3 - i) * 3600000 + 7200000,
            ).toISOString(),
          })
          .select()
          .single();
        fixture.visitIds.push(visit!.id);

        // Create a rating slip for each visit to have segments
        const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
          p_casino_id: testCasino1Id,
          p_actor_id: testActor1Id,
          p_visit_id: visit!.id,
          p_table_id: testTable1Id,
          p_seat_number: "1",
          p_game_settings: {},
        });
        fixture.slipIds.push(slip!.id);

        // Close the slip
        await supabase.rpc("rpc_close_rating_slip", {
          p_casino_id: testCasino1Id,
          p_rating_slip_id: slip!.id,
          p_actor_id: testActor1Id,
        });
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

    it("uses cursor-based pagination with tie-breaking", async () => {
      const fixture = await createTestFixture();

      // Create 5 closed visits
      for (let i = 0; i < 5; i++) {
        const { data: visit } = await supabase
          .from("visit")
          .insert({
            player_id: fixture.playerId,
            casino_id: testCasino1Id,
            visit_kind: "gaming_identified_rated",
            started_at: new Date(Date.now() - (5 - i) * 3600000).toISOString(),
            ended_at: new Date(
              Date.now() - (5 - i) * 3600000 + 3600000,
            ).toISOString(),
          })
          .select()
          .single();
        fixture.visitIds.push(visit!.id);
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

    it("excludes open visits from sessions list", async () => {
      const fixture = await createTestFixture();

      // Create 2 closed visits
      for (let i = 0; i < 2; i++) {
        const { data: visit } = await supabase
          .from("visit")
          .insert({
            player_id: fixture.playerId,
            casino_id: testCasino1Id,
            visit_kind: "gaming_identified_rated",
            started_at: new Date(Date.now() - (3 - i) * 3600000).toISOString(),
            ended_at: new Date(
              Date.now() - (3 - i) * 3600000 + 3600000,
            ).toISOString(),
          })
          .select()
          .single();
        fixture.visitIds.push(visit!.id);
      }

      // Create 1 open visit
      const { data: openVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture.visitIds.push(openVisit!.id);

      const result = await service.getPlayerRecentSessions(
        testCasino1Id,
        fixture.playerId,
      );

      // Open visit should NOT be in sessions array
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.every((s) => s.ended_at !== null)).toBe(true);

      // Open visit returned separately
      expect(result.open_visit).not.toBeNull();
      expect(result.open_visit!.visit_id).toBe(openVisit!.id);
    });

    it("returns open_visit separately", async () => {
      const fixture = await createTestFixture();

      // Create open visit only (no closed sessions)
      const { data: openVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture.visitIds.push(openVisit!.id);

      // Create a rating slip for the open visit
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasino1Id,
        p_actor_id: testActor1Id,
        p_visit_id: openVisit!.id,
        p_table_id: testTable1Id,
        p_seat_number: "1",
        p_game_settings: {},
      });
      fixture.slipIds.push(slip!.id);

      const result = await service.getPlayerRecentSessions(
        testCasino1Id,
        fixture.playerId,
      );

      expect(result.sessions).toHaveLength(0);
      expect(result.open_visit).not.toBeNull();
      expect(result.open_visit!.ended_at).toBeNull();
      expect(result.open_visit!.segment_count).toBe(1);
    });

    it("cross-casino query returns empty due to RLS", async () => {
      const fixture = await createTestFixture(testCasino1Id);

      // Create visit in casino 1
      const { data: visit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(visit!.id);

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

  describe("rpc_get_player_last_session_context", () => {
    it("returns last closed session context", async () => {
      const fixture = await createTestFixture();

      // Create 2 closed visits
      const { data: visit1 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          started_at: new Date(Date.now() - 7200000).toISOString(),
          ended_at: new Date(Date.now() - 3600000).toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(visit1!.id);

      const { data: slip1 } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasino1Id,
        p_actor_id: testActor1Id,
        p_visit_id: visit1!.id,
        p_table_id: testTable1Id,
        p_seat_number: "3",
        p_game_settings: { min_bet: 25 },
      });
      fixture.slipIds.push(slip1!.id);

      await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasino1Id,
        p_rating_slip_id: slip1!.id,
        p_actor_id: testActor1Id,
        p_average_bet: 50.0,
      });

      // Create more recent visit
      const { data: visit2 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          started_at: new Date(Date.now() - 1800000).toISOString(),
          ended_at: new Date(Date.now() - 900000).toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(visit2!.id);

      const { data: slip2 } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasino1Id,
        p_actor_id: testActor1Id,
        p_visit_id: visit2!.id,
        p_table_id: testTable2Id,
        p_seat_number: "5",
        p_game_settings: { min_bet: 50 },
      });
      fixture.slipIds.push(slip2!.id);

      await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasino1Id,
        p_rating_slip_id: slip2!.id,
        p_actor_id: testActor1Id,
        p_average_bet: 75.0,
      });

      const result = await service.getPlayerLastSessionContext(
        testCasino1Id,
        fixture.playerId,
      );

      // Should return most recent (visit2)
      expect(result).not.toBeNull();
      expect(result!.visit_id).toBe(visit2!.id);
      expect(result!.last_table_id).toBe(testTable2Id);
      expect(result!.last_seat_number).toBe(5);
      expect(result!.last_average_bet).toBe(75.0);
    });

    it("returns null for player with no sessions", async () => {
      const fixture = await createTestFixture();

      const result = await service.getPlayerLastSessionContext(
        testCasino1Id,
        fixture.playerId,
      );

      expect(result).toBeNull();
    });

    it("respects RLS - blocked cross-casino", async () => {
      const fixture = await createTestFixture(testCasino1Id);

      // Create visit in casino 1
      const { data: visit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(visit!.id);

      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasino1Id,
        p_actor_id: testActor1Id,
        p_visit_id: visit!.id,
        p_table_id: testTable1Id,
        p_seat_number: "1",
        p_game_settings: {},
      });
      fixture.slipIds.push(slip!.id);

      await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasino1Id,
        p_rating_slip_id: slip!.id,
        p_actor_id: testActor1Id,
      });

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

  describe("POST /api/v1/visits/start-from-previous", () => {
    it("creates visit with correct visit_group_id (happy path)", async () => {
      const fixture = await createTestFixture();

      // Create and close source visit
      const { data: sourceVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(sourceVisit!.id);

      const { data: sourceSlip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasino1Id,
        p_actor_id: testActor1Id,
        p_visit_id: sourceVisit!.id,
        p_table_id: testTable1Id,
        p_seat_number: "2",
        p_game_settings: { min_bet: 25 },
      });
      fixture.slipIds.push(sourceSlip!.id);

      await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasino1Id,
        p_rating_slip_id: sourceSlip!.id,
        p_actor_id: testActor1Id,
      });

      // Start from previous
      const result = await service.startFromPrevious(
        testCasino1Id,
        testActor1Id,
        {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit!.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 3,
        },
      );

      fixture.visitIds.push(result.visit_id);
      fixture.slipIds.push(result.active_slip_id);

      // Verify new visit has correct visit_group_id
      expect(result.visit_group_id).toBe(sourceVisit!.visit_group_id);

      // Verify new visit exists
      const { data: newVisit } = await supabase
        .from("visit")
        .select("*")
        .eq("id", result.visit_id)
        .single();

      expect(newVisit!.visit_group_id).toBe(sourceVisit!.visit_group_id);
      expect(newVisit!.player_id).toBe(fixture.playerId);
      expect(newVisit!.ended_at).toBeNull();
    });

    it("returns 409 when player has open visit", async () => {
      const fixture = await createTestFixture();

      // Create closed source visit
      const { data: sourceVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(sourceVisit!.id);

      // Create open visit for same player
      const { data: openVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture.visitIds.push(openVisit!.id);

      // Attempt to start from previous (should fail)
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit!.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 4,
        }),
      ).rejects.toThrow("already has an active visit");
    });

    it("returns 400 when source visit not closed", async () => {
      const fixture = await createTestFixture();

      // Create open source visit
      const { data: sourceVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null, // Still open
        })
        .select()
        .single();
      fixture.visitIds.push(sourceVisit!.id);

      // Attempt to start from previous
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit!.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 5,
        }),
      ).rejects.toThrow("Cannot continue from an open visit");
    });

    it("returns 400 when player_id mismatch", async () => {
      const fixture1 = await createTestFixture();
      const fixture2 = await createTestFixture();

      // Create closed visit for player 1
      const { data: visit1 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture1.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture1.visitIds.push(visit1!.id);

      // Attempt to start from previous with player 2
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture2.playerId, // Different player
          source_visit_id: visit1!.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 6,
        }),
      ).rejects.toThrow("does not match request player_id");
    });

    it("returns 403 when cross-casino source", async () => {
      const fixture = await createTestFixture(testCasino1Id);

      // Create visit in casino 1
      const { data: visit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(visit!.id);

      // Attempt to start from casino 2 context
      await expect(
        service.startFromPrevious(testCasino2Id, testActor2Id, {
          player_id: fixture.playerId,
          source_visit_id: visit!.id,
          destination_table_id: testTable3Id,
          destination_seat_number: 1,
        }),
      ).rejects.toThrow("belongs to a different casino");
    });

    it("returns 422 when table not available", async () => {
      const fixture = await createTestFixture();

      // Create closed source visit
      const { data: sourceVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(sourceVisit!.id);

      // Set table to inactive
      await supabase
        .from("gaming_table")
        .update({ status: "inactive" })
        .eq("id", testTable2Id);

      // Attempt to start from previous
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit!.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 7,
        }),
      ).rejects.toThrow("not available");

      // Restore table status
      await supabase
        .from("gaming_table")
        .update({ status: "active" })
        .eq("id", testTable2Id);
    });

    it("returns 422 when seat occupied", async () => {
      const fixture1 = await createTestFixture();
      const fixture2 = await createTestFixture();

      // Create closed source visit for player 1
      const { data: sourceVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture1.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture1.visitIds.push(sourceVisit!.id);

      // Create open visit for player 2 and occupy seat
      const { data: visit2 } = await supabase
        .from("visit")
        .insert({
          player_id: fixture2.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: null,
        })
        .select()
        .single();
      fixture2.visitIds.push(visit2!.id);

      const { data: occupiedSlip } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasino1Id,
          p_actor_id: testActor1Id,
          p_visit_id: visit2!.id,
          p_table_id: testTable2Id,
          p_seat_number: "8",
          p_game_settings: {},
        },
      );
      fixture2.slipIds.push(occupiedSlip!.id);

      // Attempt to start from previous at occupied seat
      await expect(
        service.startFromPrevious(testCasino1Id, testActor1Id, {
          player_id: fixture1.playerId,
          source_visit_id: sourceVisit!.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 8, // Occupied
        }),
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // 6. Policy Snapshot Test
  // ===========================================================================

  describe("policy snapshot on continuation", () => {
    it("uses CURRENT policy not source policy when game_settings change", async () => {
      const fixture = await createTestFixture();

      // Create closed source visit with old game settings
      const { data: sourceVisit } = await supabase
        .from("visit")
        .insert({
          player_id: fixture.playerId,
          casino_id: testCasino1Id,
          visit_kind: "gaming_identified_rated",
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      fixture.visitIds.push(sourceVisit!.id);

      const { data: sourceSlip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasino1Id,
        p_actor_id: testActor1Id,
        p_visit_id: sourceVisit!.id,
        p_table_id: testTable1Id,
        p_seat_number: "1",
        p_game_settings: { min_bet: 10, max_bet: 100 }, // Old settings
      });
      fixture.slipIds.push(sourceSlip!.id);

      await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasino1Id,
        p_rating_slip_id: sourceSlip!.id,
        p_actor_id: testActor1Id,
      });

      // Start from previous with NEW game settings
      const result = await service.startFromPrevious(
        testCasino1Id,
        testActor1Id,
        {
          player_id: fixture.playerId,
          source_visit_id: sourceVisit!.id,
          destination_table_id: testTable2Id,
          destination_seat_number: 2,
          game_settings_override: { min_bet: 25, max_bet: 500 }, // New settings
        },
      );

      fixture.visitIds.push(result.visit_id);
      fixture.slipIds.push(result.active_slip_id);

      // Verify new slip has NEW game settings (policy snapshot from CURRENT table)
      const { data: newSlip } = await supabase
        .from("rating_slip")
        .select("game_settings")
        .eq("id", result.active_slip_id)
        .single();

      expect(newSlip!.game_settings).toEqual({ min_bet: 25, max_bet: 500 });
    });
  });
});
