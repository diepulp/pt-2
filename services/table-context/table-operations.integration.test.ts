/**
 * Table Operations Integration Tests
 * Tests RPC functions with real Supabase database
 * Verifies RLS enforcement and state transitions
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

describe("Table Operations Integration Tests", () => {
  let supabase: SupabaseClient<Database>;
  let testCasinoA: string;
  let testCasinoB: string;
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
        employee_id: "TEST-STAFF-001",
        role: "pit_boss",
      })
      .select()
      .single();

    if (staffError) throw staffError;
    testStaffId = staff.id;

    // Create test tables
    const { data: tableA, error: tableAError } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasinoA,
        label: "Test Table A",
        type: "blackjack",
        status: "inactive",
      })
      .select()
      .single();

    if (tableAError) throw tableAError;
    testTableA = tableA.id;

    const { data: tableB, error: tableBError } = await supabase
      .from("gaming_table")
      .insert({
        casino_id: testCasinoB,
        label: "Test Table B",
        type: "blackjack",
        status: "inactive",
      })
      .select()
      .single();

    if (tableBError) throw tableBError;
    testTableB = tableB.id;
  });

  afterAll(async () => {
    // Clean up test data
    await supabase.from("gaming_table").delete().eq("id", testTableA);
    await supabase.from("gaming_table").delete().eq("id", testTableB);
    await supabase.from("staff").delete().eq("id", testStaffId);
    await supabase.from("casino").delete().eq("id", testCasinoA);
    await supabase.from("casino").delete().eq("id", testCasinoB);
  });

  beforeEach(async () => {
    // Reset table status to inactive before each test
    await supabase
      .from("gaming_table")
      .update({ status: "inactive" })
      .eq("id", testTableA);
  });

  describe("rpc_update_table_status", () => {
    it("successfully transitions table from inactive to active", async () => {
      const { data, error } = await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "active",
        p_actor_id: testStaffId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.status).toBe("active");
      expect(data?.id).toBe(testTableA);
    });

    it("successfully transitions table from active to inactive", async () => {
      // First set to active
      await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "active",
        p_actor_id: testStaffId,
      });

      // Then transition back to inactive
      const { data, error } = await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "inactive",
        p_actor_id: testStaffId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.status).toBe("inactive");
    });

    it("successfully transitions table from active to closed", async () => {
      // First set to active
      await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "active",
        p_actor_id: testStaffId,
      });

      // Then transition to closed
      const { data, error } = await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "closed",
        p_actor_id: testStaffId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.status).toBe("closed");
    });

    it("rejects invalid transition from inactive to closed", async () => {
      const { data, error } = await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "closed",
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("TABLE_INVALID_TRANSITION");
    });

    it("rejects invalid transition from closed to active", async () => {
      // First close the table
      await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "active",
        p_actor_id: testStaffId,
      });
      await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "closed",
        p_actor_id: testStaffId,
      });

      // Attempt to reopen
      const { data, error } = await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "active",
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("TABLE_INVALID_TRANSITION");
    });

    it("rejects update for non-existent table", async () => {
      const fakeTableId = "00000000-0000-0000-0000-000000000000";

      const { data, error } = await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: fakeTableId,
        p_new_status: "active",
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("TABLE_NOT_FOUND");
    });

    it("creates audit log entry for table status update", async () => {
      await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "active",
        p_actor_id: testStaffId,
      });

      // Check audit log
      const { data: auditLogs, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("domain", "table-context")
        .eq("action", "update_table_status")
        .order("created_at", { ascending: false })
        .limit(1);

      expect(error).toBeNull();
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs?.[0].casino_id).toBe(testCasinoA);
      expect(auditLogs?.[0].actor_id).toBe(testStaffId);
    });
  });

  describe("RLS Enforcement - Cross-Casino Access", () => {
    it("blocks cross-casino table access via RPC", async () => {
      // Attempt to update Casino B's table using Casino A's context
      const { data, error } = await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableB, // Table from Casino B
        p_new_status: "active",
        p_actor_id: testStaffId,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain("TABLE_NOT_FOUND");
    });

    it("allows same-casino table access via RPC", async () => {
      const { data, error } = await supabase.rpc("rpc_update_table_status", {
        p_casino_id: testCasinoA,
        p_table_id: testTableA,
        p_new_status: "active",
        p_actor_id: testStaffId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.id).toBe(testTableA);
    });
  });
});
