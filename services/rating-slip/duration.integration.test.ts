/**
 * Rating Slip Duration Calculation Integration Tests
 * Tests duration calculation with real database
 * Verifies: Duration excludes pause time accurately
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

// Helper to wait for time to pass
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Rating Slip Duration Calculation Integration Tests", () => {
  let supabase: SupabaseClient<Database>;
  let testCasinoId: string;
  let testPlayerId: string;
  let testVisitId: string;
  let testTableId: string;
  let testStaffId: string;

  beforeAll(async () => {
    // Use service role client for setup
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test casino
    const { data: casino, error: casinoError } = await supabase
      .from("casino")
      .insert({ name: "Duration Test Casino", status: "active" })
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
        last_name: "Staff Duration",
        employee_id: "TEST-STAFF-DUR-001",
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
        last_name: "Player Duration",
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

    // Create test table (active)
    const { data: table, error: tableError } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasinoId,
        label: "Test Table Duration",
        type: "blackjack",
        status: "active",
      })
      .select()
      .single();

    if (tableError) throw tableError;
    testTableId = table.id;
  });

  afterAll(async () => {
    // Clean up test data
    await supabase.from("rating_slip").delete().eq("casino_id", testCasinoId);
    await supabase.from("gaming_table").delete().eq("id", testTableId);
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

  describe("Duration Calculation Without Pauses", () => {
    it("calculates duration for simple open-to-close lifecycle", async () => {
      // Start slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Wait approximately 2 seconds
      await sleep(2100);

      // Close slip
      const { data: result } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      const duration = result?.[0].duration_seconds;
      expect(duration).toBeGreaterThanOrEqual(2);
      expect(duration).toBeLessThan(4); // Allow some margin for execution time
    });

    it("returns zero duration for immediate close", async () => {
      // Start and immediately close
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      const { data: result } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      const duration = result?.[0].duration_seconds;
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(2);
    });
  });

  describe("Duration Calculation With Pauses", () => {
    it("excludes pause time from total duration (single pause)", async () => {
      // Start slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Active for ~1 second
      await sleep(1100);

      // Pause
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Paused for ~2 seconds
      await sleep(2100);

      // Resume
      await supabase.rpc("rpc_resume_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Active for ~1 second
      await sleep(1100);

      // Close
      const { data: result } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      const duration = result?.[0].duration_seconds;

      // Duration should be ~2 seconds (1s + 1s), not ~4 seconds
      expect(duration).toBeGreaterThanOrEqual(2);
      expect(duration).toBeLessThan(4);
    });

    it("excludes pause time from total duration (multiple pauses)", async () => {
      // Start slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Active for ~1 second
      await sleep(1100);

      // Pause 1
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Paused for ~1 second
      await sleep(1100);

      // Resume
      await supabase.rpc("rpc_resume_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Active for ~1 second
      await sleep(1100);

      // Pause 2
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Paused for ~1 second
      await sleep(1100);

      // Resume
      await supabase.rpc("rpc_resume_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Active for ~1 second
      await sleep(1100);

      // Close
      const { data: result } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      const duration = result?.[0].duration_seconds;

      // Duration should be ~3 seconds (1s + 1s + 1s), not ~5 seconds
      expect(duration).toBeGreaterThanOrEqual(3);
      expect(duration).toBeLessThan(5);

      // Verify two pause records exist
      const { data: pauseRecords } = await supabase
        .from("rating_slip_pause")
        .select("*")
        .eq("rating_slip_id", slip!.id)
        .order("started_at", { ascending: true });

      expect(pauseRecords).toHaveLength(2);
      expect(pauseRecords?.[0].ended_at).not.toBeNull();
      expect(pauseRecords?.[1].ended_at).not.toBeNull();
    }, 10000); // 10 second timeout

    it("handles closing while paused (freezes duration at pause time)", async () => {
      // Start slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Active for ~2 seconds
      await sleep(2100);

      // Pause
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Paused for ~3 seconds (this time should not count)
      await sleep(3100);

      // Close while paused
      const { data: result } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      const duration = result?.[0].duration_seconds;

      // Duration should be ~2 seconds (active time only), not ~5 seconds
      expect(duration).toBeGreaterThanOrEqual(2);
      expect(duration).toBeLessThan(4);
    }, 10000); // 10 second timeout
  });

  describe("rpc_get_rating_slip_duration", () => {
    it("returns current duration for open slip", async () => {
      // Start slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Wait ~1 second
      await sleep(1100);

      // Get duration
      const { data: duration1 } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: slip!.id,
        },
      );

      expect(duration1).toBeGreaterThanOrEqual(1);
      expect(duration1).toBeLessThan(3);

      // Wait another ~1 second
      await sleep(1100);

      // Get duration again (should increase)
      const { data: duration2 } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: slip!.id,
        },
      );

      expect(duration2).toBeGreaterThan(duration1!);
      expect(duration2).toBeGreaterThanOrEqual(2);
    });

    it("returns frozen duration for paused slip", async () => {
      // Start slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Active for ~2 seconds
      await sleep(2100);

      // Pause
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Get duration immediately after pause
      const { data: duration1 } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: slip!.id,
        },
      );

      expect(duration1).toBeGreaterThanOrEqual(2);

      // Wait ~2 seconds while paused
      await sleep(2100);

      // Get duration again (should NOT increase significantly)
      const { data: duration2 } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: slip!.id,
        },
      );

      // Duration should be approximately the same (within 1 second tolerance)
      expect(Math.abs(duration2! - duration1!)).toBeLessThanOrEqual(1);
    });

    it("returns final duration for closed slip", async () => {
      // Start slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Wait ~2 seconds
      await sleep(2100);

      // Close
      const { data: closeResult } = await supabase.rpc(
        "rpc_close_rating_slip",
        {
          p_casino_id: testCasinoId,
          p_rating_slip_id: slip!.id,
          p_actor_id: testStaffId,
        },
      );

      const closeDuration = closeResult?.[0].duration_seconds;

      // Get duration via get function
      const { data: getDuration } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: slip!.id,
        },
      );

      // Both should match
      expect(getDuration).toBe(closeDuration);

      // Wait and check again (should not change)
      await sleep(1100);

      const { data: getDuration2 } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: slip!.id,
        },
      );

      expect(getDuration2).toBe(closeDuration);
    });

    it("returns null for non-existent slip", async () => {
      const fakeSlipId = "00000000-0000-0000-0000-000000000000";

      const { data: duration } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: fakeSlipId,
        },
      );

      expect(duration).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("handles very short active periods between pauses", async () => {
      // Start slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoId,
        p_player_id: testPlayerId,
        p_visit_id: testVisitId,
        p_table_id: testTableId,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Immediately pause
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Paused for ~1 second
      await sleep(1100);

      // Resume and immediately pause again
      await supabase.rpc("rpc_resume_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Close
      const { data: result } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoId,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      const duration = result?.[0].duration_seconds;

      // Duration should be very small (not include pause times)
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(2);
    });
  });
});
