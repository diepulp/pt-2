/**
 * Rating Slip Unique Constraint Integration Tests
 * Tests the unique constraint preventing duplicate active slips
 * Verifies: Only one open/paused slip per player per table
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

import type { Database } from "@/types/database.types";

// Test environment setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe("Rating Slip Unique Constraint Integration Tests", () => {
  let supabase: SupabaseClient<Database>;
  let testCasinoId: string;
  let testPlayerId: string;
  let testVisitId: string;
  let testTableA: string;
  let testTableB: string;
  let testStaffId: string;

  beforeAll(async () => {
    // Use service role client for setup
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test casino
    const { data: casino, error: casinoError } = await supabase
      .from("casino")
      .insert({ name: "Unique Constraint Test Casino", status: "active" })
      .select()
      .single();

    if (casinoError) throw casinoError;
    testCasinoId = casino.id;

    // Create test staff
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .insert({
        casino_id: testCasinoId,
        first_name: "Test",
        last_name: "Staff",
        employee_id: "TEST-STAFF-UC-001",
        role: "pit_boss",
      })
      .select()
      .single();

    if (staffError) throw staffError;
    testStaffId = staff.id;

    // Create test player
    const { data: player, error: playerError } = await supabase
      .from("player")
      .insert({
        first_name: "Test",
        last_name: "Player UC",
      })
      .select()
      .single();

    if (playerError) throw playerError;
    testPlayerId = player.id;

    // Link player to casino
    await supabase.from("player_casino").insert({
      player_id: testPlayerId,
      casino_id: testCasinoId,
      status: "active",
    });

    // Create test visit
    const { data: visit, error: visitError } = await supabase
      .from("visit")
      .insert({
        casino_id: testCasinoId,
        player_id: testPlayerId,
      })
      .select()
      .single();

    if (visitError) throw visitError;
    testVisitId = visit.id;

    // Create test tables (both active)
    const { data: tableA, error: tableAError } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasinoId,
        label: "Test Table UC-A",
        type: "blackjack",
        status: "active",
      })
      .select()
      .single();

    if (tableAError) throw tableAError;
    testTableA = tableA.id;

    const { data: tableB, error: tableBError } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasinoId,
        label: "Test Table UC-B",
        type: "roulette",
        status: "active",
      })
      .select()
      .single();

    if (tableBError) throw tableBError;
    testTableB = tableB.id;
  });

  afterAll(async () => {
    // Clean up test data
    await supabase.from("rating_slip").delete().eq("casino_id", testCasinoId);
    await supabase.from("gaming_table").delete().eq("id", testTableA);
    await supabase.from("gaming_table").delete().eq("id", testTableB);
    await supabase.from("visit").delete().eq("id", testVisitId);
    await supabase.from("player_casino").delete().eq("player_id", testPlayerId);
    await supabase.from("player").delete().eq("id", testPlayerId);
    await supabase.from("staff").delete().eq("id", testStaffId);
    await supabase.from("casino").delete().eq("id", testCasinoId);
  });

  beforeEach(async () => {
    // Clean up rating slips before each test
    await supabase.from("rating_slip").delete().eq("casino_id", testCasinoId);
  });

  describe("Unique Active Slip Constraint", () => {
    it("blocks duplicate active slip for same player at same table when first is open", async () => {
      // Start first slip
      const { data: slip1, error: error1 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_table_id: testTableA,
          p_seat_number: "Seat 1",
          p_game_settings: { min_bet: 25, max_bet: 500 },
          p_actor_id: testStaffId,
        },
      );

      expect(error1).toBeNull();
      expect(slip1?.status).toBe("open");

      // Attempt to start second slip for same player at same table
      const { data: slip2, error: error2 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_table_id: testTableA,
          p_seat_number: "Seat 2", // Different seat
          p_game_settings: { min_bet: 25, max_bet: 500 },
          p_actor_id: testStaffId,
        },
      );

      expect(error2).toBeDefined();
      // PostgreSQL unique constraint violation
      expect(error2?.message).toContain(
        "duplicate key value violates unique constraint",
      );
      expect(error2?.message).toContain("ux_rating_slip_player_table_active");
    });

    it("blocks duplicate active slip for same player at same table when first is paused", async () => {
      // Start first slip
      const { data: slip1 } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Pause first slip
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip1!.id,
        p_actor_id: testStaffId,
      });

      // Attempt to start second slip
      const { data: slip2, error: error2 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_table_id: testTableA,
          p_seat_number: "Seat 2",
          p_game_settings: { min_bet: 25, max_bet: 500 },
          p_actor_id: testStaffId,
        },
      );

      expect(error2).toBeDefined();
      expect(error2?.message).toContain(
        "duplicate key value violates unique constraint",
      );
    });

    it("allows new slip after previous slip closed", async () => {
      // Start and close first slip
      const { data: slip1 } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip1!.id,
        p_actor_id: testStaffId,
        p_average_bet: 50,
      });

      // Start second slip (should succeed)
      const { data: slip2, error: error2 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_table_id: testTableA,
          p_seat_number: "Seat 1",
          p_game_settings: { min_bet: 25, max_bet: 500 },
          p_actor_id: testStaffId,
        },
      );

      expect(error2).toBeNull();
      expect(slip2).toBeDefined();
      expect(slip2?.status).toBe("open");
      expect(slip2?.id).not.toBe(slip1!.id);
    });

    it("allows slip for same player at different table", async () => {
      // Start slip at Table A
      const { data: slip1, error: error1 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_table_id: testTableA,
          p_seat_number: "Seat 1",
          p_game_settings: { min_bet: 25, max_bet: 500 },
          p_actor_id: testStaffId,
        },
      );

      expect(error1).toBeNull();
      expect(slip1?.status).toBe("open");

      // Start slip at Table B (different table, same player - should succeed)
      const { data: slip2, error: error2 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_table_id: testTableB, // Different table
          p_seat_number: "Seat 1",
          p_game_settings: { min_bet: 10, max_bet: 100 },
          p_actor_id: testStaffId,
        },
      );

      expect(error2).toBeNull();
      expect(slip2).toBeDefined();
      expect(slip2?.status).toBe("open");
      expect(slip2?.table_id).toBe(testTableB);
      expect(slip2?.id).not.toBe(slip1!.id);
    });

    it("allows multiple slips for different players at same table", async () => {
      // Create second player
      const { data: player2 } = await supabase
        .from("player")
        .insert({
          first_name: "Test",
          last_name: "Player UC 2",
        })
        .select()
        .single();

      // Link player 2 to casino
      await supabase.from("player_casino").insert({
        player_id: player2!.id,
        casino_id: testCasinoId,
        status: "active",
      });

      // Create visit for second player
      const { data: visit2 } = await supabase
        .from("visit")
        .insert({
          casino_id: testCasinoId,
          player_id: player2!.id,
        })
        .select()
        .single();

      // Start slip for Player 1
      const { data: slip1, error: error1 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_table_id: testTableA,
          p_seat_number: "Seat 1",
          p_game_settings: { min_bet: 25, max_bet: 500 },
          p_actor_id: testStaffId,
        },
      );

      expect(error1).toBeNull();
      expect(slip1?.status).toBe("open");

      // Start slip for Player 2 at same table (should succeed)
      const { data: slip2, error: error2 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: player2!.id,
          p_visit_id: visit2!.id,
          p_table_id: testTableA, // Same table
          p_seat_number: "Seat 2",
          p_game_settings: { min_bet: 25, max_bet: 500 },
          p_actor_id: testStaffId,
        },
      );

      expect(error2).toBeNull();
      expect(slip2).toBeDefined();
      expect(slip2?.status).toBe("open");
      expect(slip2?.player_id).toBe(player2!.id);
      expect(slip2?.table_id).toBe(testTableA);

      // Clean up
      await supabase.from("rating_slip").delete().eq("player_id", player2!.id);
      await supabase.from("visit").delete().eq("id", visit2!.id);
      await supabase
        .from("player_casino")
        .delete()
        .eq("player_id", player2!.id);
      await supabase.from("player").delete().eq("id", player2!.id);
    });

    it("allows reopening slip after pause and close", async () => {
      // Start slip
      const { data: slip1 } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Pause
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip1!.id,
        p_actor_id: testStaffId,
      });

      // Close while paused
      await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip1!.id,
        p_actor_id: testStaffId,
      });

      // Start new slip (should succeed)
      const { data: slip2, error: error2 } = await supabase.rpc(
        "rpc_start_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_player_id: testPlayerId,
          p_visit_id: testVisitId,
          p_table_id: testTableA,
          p_seat_number: "Seat 1",
          p_game_settings: { min_bet: 25, max_bet: 500 },
          p_actor_id: testStaffId,
        },
      );

      expect(error2).toBeNull();
      expect(slip2).toBeDefined();
      expect(slip2?.status).toBe("open");
    });
  });
});
