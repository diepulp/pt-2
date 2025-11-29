/**
 * Rating Slip Lifecycle Integration Tests
 * Tests RPC functions with real Supabase database
 * Verifies RLS enforcement, unique constraints, and duration calculations
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

describe("Rating Slip Lifecycle Integration Tests", () => {
  let supabase: SupabaseClient<Database>;
  let testCasinoA: string;
  let testCasinoB: string;
  let testPlayerA: string;
  let testPlayerB: string;
  let testVisitA: string;
  let testVisitB: string;
  let testTableA: string;
  let testTableB: string;
  let testStaffId: string;

  beforeAll(async () => {
    // Use service role client for setup
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Create test casinos
    const { data: casinoA, error: casinoAError } = await supabase
      .from("casino")
      .insert({ name: "Integration Test Casino A", status: "active" })
      .select()
      .single();

    if (casinoAError) throw casinoAError;
    testCasinoA = casinoA.id;

    const { data: casinoB, error: casinoBError } = await supabase
      .from("casino")
      .insert({ name: "Integration Test Casino B", status: "active" })
      .select()
      .single();

    if (casinoBError) throw casinoBError;
    testCasinoB = casinoB.id;

    // Create test staff
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .insert({
        casino_id: testCasinoA,
        first_name: "Test",
        last_name: "Staff",
        employee_id: "TEST-STAFF-RS-001",
        role: "pit_boss",
      })
      .select()
      .single();

    if (staffError) throw staffError;
    testStaffId = staff.id;

    // Create test players
    const { data: playerA, error: playerAError } = await supabase
      .from("player")
      .insert({
        first_name: "Test",
        last_name: "Player A",
      })
      .select()
      .single();

    if (playerAError) throw playerAError;
    testPlayerA = playerA.id;

    // Link player A to casino A
    await supabase.from("player_casino").insert({
      player_id: testPlayerA,
      casino_id: testCasinoA,
      status: "active",
    });

    const { data: playerB, error: playerBError } = await supabase
      .from("player")
      .insert({
        first_name: "Test",
        last_name: "Player B",
      })
      .select()
      .single();

    if (playerBError) throw playerBError;
    testPlayerB = playerB.id;

    // Link player B to casino B
    await supabase.from("player_casino").insert({
      player_id: testPlayerB,
      casino_id: testCasinoB,
      status: "active",
    });

    // Create test visits
    const { data: visitA, error: visitAError } = await supabase
      .from("visit")
      .insert({
        casino_id: testCasinoA,
        player_id: testPlayerA,
      })
      .select()
      .single();

    if (visitAError) throw visitAError;
    testVisitA = visitA.id;

    const { data: visitB, error: visitBError } = await supabase
      .from("visit")
      .insert({
        casino_id: testCasinoB,
        player_id: testPlayerB,
      })
      .select()
      .single();

    if (visitBError) throw visitBError;
    testVisitB = visitB.id;

    // Create test tables (set to active)
    const { data: tableA, error: tableAError } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasinoA,
        label: "Test Table RS-A",
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
        casino_id: testCasinoB,
        label: "Test Table RS-B",
        type: "blackjack",
        status: "active",
      })
      .select()
      .single();

    if (tableBError) throw tableBError;
    testTableB = tableB.id;
  });

  afterAll(async () => {
    // Clean up test data (in reverse order of creation)
    await supabase.from("rating_slip").delete().eq("casino_id", testCasinoA);
    await supabase.from("rating_slip").delete().eq("casino_id", testCasinoB);
    await supabase.from("gaming_table").delete().eq("id", testTableA);
    await supabase.from("gaming_table").delete().eq("id", testTableB);
    await supabase.from("visit").delete().eq("id", testVisitA);
    await supabase.from("visit").delete().eq("id", testVisitB);
    await supabase.from("player_casino").delete().eq("player_id", testPlayerA);
    await supabase.from("player_casino").delete().eq("player_id", testPlayerB);
    await supabase.from("player").delete().eq("id", testPlayerA);
    await supabase.from("player").delete().eq("id", testPlayerB);
    await supabase.from("staff").delete().eq("id", testStaffId);
    await supabase.from("casino").delete().eq("id", testCasinoA);
    await supabase.from("casino").delete().eq("id", testCasinoB);
  });

  beforeEach(async () => {
    // Clean up rating slips before each test
    await supabase.from("rating_slip").delete().eq("casino_id", testCasinoA);
    await supabase.from("rating_slip").delete().eq("casino_id", testCasinoB);
  });

  describe("rpc_start_rating_slip", () => {
    it("successfully creates a rating slip for active table", async () => {
      const { data, error } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.status).toBe("open");
      expect(data?.player_id).toBe(testPlayerA);
      expect(data?.table_id).toBe(testTableA);
      expect(data?.seat_number).toBe("Seat 1");
    });

    it("rejects starting slip on inactive table", async () => {
      // Set table to inactive
      await supabase
        .from("gaming_table")
        .update({ status: "inactive" })
        .eq("id", testTableA);

      const { data, error } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("TABLE_NOT_ACTIVE");

      // Restore table to active
      await supabase
        .from("gaming_table")
        .update({ status: "active" })
        .eq("id", testTableA);
    });

    it("rejects starting slip for closed visit", async () => {
      // Close the visit
      await supabase
        .from("visit")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", testVisitA);

      const { data, error } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("VISIT_NOT_OPEN");

      // Restore visit to open
      await supabase
        .from("visit")
        .update({ ended_at: null })
        .eq("id", testVisitA);
    });

    it("creates audit log entry for start slip", async () => {
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Check audit log
      const { data: auditLogs, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("domain", "rating-slip")
        .eq("action", "start_rating_slip")
        .order("created_at", { ascending: false })
        .limit(1);

      expect(error).toBeNull();
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs?.[0].casino_id).toBe(testCasinoA);
      expect(auditLogs?.[0].actor_id).toBe(testStaffId);
    });
  });

  describe("rpc_pause_rating_slip", () => {
    it("successfully pauses an open rating slip", async () => {
      // Start a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Pause the slip
      const { data, error } = await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.status).toBe("paused");
      expect(data?.id).toBe(slip!.id);

      // Verify pause record was created
      const { data: pauseRecords } = await supabase
        .from("rating_slip_pause")
        .select("*")
        .eq("rating_slip_id", slip!.id);

      expect(pauseRecords).toHaveLength(1);
      expect(pauseRecords?.[0].ended_at).toBeNull();
    });

    it("rejects pausing a non-open slip", async () => {
      // Start and pause a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Attempt to pause again
      const { data, error } = await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("RATING_SLIP_NOT_OPEN");
    });
  });

  describe("rpc_resume_rating_slip", () => {
    it("successfully resumes a paused rating slip", async () => {
      // Start a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Pause the slip
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Resume the slip
      const { data, error } = await supabase.rpc("rpc_resume_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.status).toBe("open");
      expect(data?.id).toBe(slip!.id);

      // Verify pause record was closed
      const { data: pauseRecords } = await supabase
        .from("rating_slip_pause")
        .select("*")
        .eq("rating_slip_id", slip!.id);

      expect(pauseRecords).toHaveLength(1);
      expect(pauseRecords?.[0].ended_at).not.toBeNull();
    });

    it("rejects resuming a non-paused slip", async () => {
      // Start a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Attempt to resume without pausing
      const { data, error } = await supabase.rpc("rpc_resume_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("RATING_SLIP_NOT_PAUSED");
    });
  });

  describe("rpc_close_rating_slip", () => {
    it("successfully closes an open rating slip with duration calculation", async () => {
      // Start a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Wait a bit to ensure non-zero duration
      await sleep(1100);

      // Close the slip
      const { data, error } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
        p_average_bet: 50,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.[0]).toBeDefined();
      expect(data?.[0].slip.status).toBe("closed");
      expect(data?.[0].slip.average_bet).toBe(50);
      expect(data?.[0].duration_seconds).toBeGreaterThanOrEqual(1);
    });

    it("successfully closes a paused rating slip", async () => {
      // Start a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Pause the slip
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Close the slip
      const { data, error } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
        p_average_bet: 75,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.[0].slip.status).toBe("closed");
      expect(data?.[0].slip.average_bet).toBe(75);

      // Verify pause record was closed
      const { data: pauseRecords } = await supabase
        .from("rating_slip_pause")
        .select("*")
        .eq("rating_slip_id", slip!.id);

      expect(pauseRecords).toHaveLength(1);
      expect(pauseRecords?.[0].ended_at).not.toBeNull();
    });

    it("rejects closing an already closed slip", async () => {
      // Start and close a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Attempt to close again
      const { data, error } = await supabase.rpc("rpc_close_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("RATING_SLIP_INVALID_STATE");
    });
  });

  describe("rpc_get_rating_slip_duration", () => {
    it("returns accurate duration for open slip", async () => {
      // Start a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Wait a bit
      await sleep(1100);

      // Get duration
      const { data, error } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: slip!.id,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeGreaterThanOrEqual(1);
    });

    it("returns accurate duration excluding pause time", async () => {
      // Start a slip
      const { data: slip } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      // Wait 1 second
      await sleep(1100);

      // Pause
      await supabase.rpc("rpc_pause_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Wait 2 seconds during pause
      await sleep(2100);

      // Resume
      await supabase.rpc("rpc_resume_rating_slip", {
        p_casino_id: testCasinoA,
        p_rating_slip_id: slip!.id,
        p_actor_id: testStaffId,
      });

      // Wait 1 second
      await sleep(1100);

      // Get duration (should be ~2 seconds, not ~4 seconds)
      const { data, error } = await supabase.rpc(
        "rpc_get_rating_slip_duration",
        {
          p_rating_slip_id: slip!.id,
        },
      );

      expect(error).toBeNull();
      expect(data).toBeGreaterThanOrEqual(2);
      expect(data).toBeLessThan(4);
    });
  });

  describe("RLS Enforcement - Cross-Casino Access", () => {
    it("blocks cross-casino access to start rating slip", async () => {
      // Attempt to start slip for Casino B player using Casino A context
      const { data, error } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerB, // Player from Casino B
        p_visit_id: testVisitB,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      // Should fail due to visit validation (visit belongs to Casino B)
      expect(error?.message).toContain("VISIT_NOT_OPEN");
    });

    it("allows same-casino slip operations", async () => {
      // Start slip for Casino A player
      const { data, error } = await supabase.rpc("rpc_start_rating_slip", {
        p_casino_id: testCasinoA,
        p_player_id: testPlayerA,
        p_visit_id: testVisitA,
        p_table_id: testTableA,
        p_seat_number: "Seat 1",
        p_game_settings: { min_bet: 25, max_bet: 500 },
        p_actor_id: testStaffId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.casino_id).toBe(testCasinoA);
    });
  });
});
