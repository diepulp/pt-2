/**
 * Unit Tests for Table Operations
 * Tests RPC-based table status updates with mocked Supabase client
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

type TableStatus = Database["public"]["Enums"]["table_status"];
type GamingTable = Database["public"]["Tables"]["gaming_table"]["Row"];

/**
 * Mock Supabase client builder for table operations
 * @test This is a test double for unit testing purposes
 */
function createMockSupabaseClient(
  rpcMock: jest.Mock,
): SupabaseClient<Database> {
  return {
    rpc: rpcMock,
  } as unknown as SupabaseClient<Database>;
}

/**
 * Service function under test - updateTableStatus
 * Calls rpc_update_table_status to transition table status
 */
async function updateTableStatus(
  supabase: SupabaseClient<Database>,
  params: {
    casinoId: string;
    tableId: string;
    newStatus: TableStatus;
    actorId: string;
  },
): Promise<{ data: GamingTable | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc("rpc_update_table_status", {
      p_casino_id: params.casinoId,
      p_table_id: params.tableId,
      p_new_status: params.newStatus,
      p_actor_id: params.actorId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as GamingTable, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Type guard to validate table DTO
 */
function isValidTableDTO(data: unknown): data is GamingTable {
  if (!data || typeof data !== "object") return false;

  const table = data as Partial<GamingTable>;

  return (
    typeof table.id === "string" &&
    typeof table.casino_id === "string" &&
    typeof table.label === "string" &&
    typeof table.type === "string" &&
    typeof table.status === "string" &&
    ["inactive", "active", "closed"].includes(table.status)
  );
}

describe("Table Operations", () => {
  describe("updateTableStatus", () => {
    it("successfully transitions inactive → active", async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: {
          id: "table-1",
          casino_id: "casino-1",
          label: "Blackjack 1",
          type: "blackjack",
          status: "active",
          pit: "Main Floor",
          created_at: "2025-05-05T10:00:00Z",
        },
        error: null,
      });

      const supabase = createMockSupabaseClient(mockRpc);

      const result = await updateTableStatus(supabase, {
        casinoId: "casino-1",
        tableId: "table-1",
        newStatus: "active",
        actorId: "staff-1",
      });

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data?.status).toBe("active");
      expect(mockRpc).toHaveBeenCalledWith("rpc_update_table_status", {
        p_casino_id: "casino-1",
        p_table_id: "table-1",
        p_new_status: "active",
        p_actor_id: "staff-1",
      });
    });

    it("successfully transitions active → inactive", async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: {
          id: "table-1",
          casino_id: "casino-1",
          label: "Blackjack 1",
          type: "blackjack",
          status: "inactive",
          pit: "Main Floor",
          created_at: "2025-05-05T10:00:00Z",
        },
        error: null,
      });

      const supabase = createMockSupabaseClient(mockRpc);

      const result = await updateTableStatus(supabase, {
        casinoId: "casino-1",
        tableId: "table-1",
        newStatus: "inactive",
        actorId: "staff-1",
      });

      expect(result.error).toBeNull();
      expect(result.data?.status).toBe("inactive");
    });

    it("successfully transitions active → closed", async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: {
          id: "table-1",
          casino_id: "casino-1",
          label: "Blackjack 1",
          type: "blackjack",
          status: "closed",
          pit: "Main Floor",
          created_at: "2025-05-05T10:00:00Z",
        },
        error: null,
      });

      const supabase = createMockSupabaseClient(mockRpc);

      const result = await updateTableStatus(supabase, {
        casinoId: "casino-1",
        tableId: "table-1",
        newStatus: "closed",
        actorId: "staff-1",
      });

      expect(result.error).toBeNull();
      expect(result.data?.status).toBe("closed");
    });

    it("returns error for TABLE_NOT_FOUND", async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: "TABLE_NOT_FOUND: Table table-999 not found" },
      });

      const supabase = createMockSupabaseClient(mockRpc);

      const result = await updateTableStatus(supabase, {
        casinoId: "casino-1",
        tableId: "table-999",
        newStatus: "active",
        actorId: "staff-1",
      });

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain("TABLE_NOT_FOUND");
      expect(result.data).toBeNull();
    });

    it("returns error for TABLE_INVALID_TRANSITION", async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: {
          message:
            "TABLE_INVALID_TRANSITION: Cannot transition from closed to active",
        },
      });

      const supabase = createMockSupabaseClient(mockRpc);

      const result = await updateTableStatus(supabase, {
        casinoId: "casino-1",
        tableId: "table-1",
        newStatus: "active",
        actorId: "staff-1",
      });

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain("TABLE_INVALID_TRANSITION");
      expect(result.data).toBeNull();
    });

    it("handles generic RPC errors", async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: "Network timeout" },
      });

      const supabase = createMockSupabaseClient(mockRpc);

      const result = await updateTableStatus(supabase, {
        casinoId: "casino-1",
        tableId: "table-1",
        newStatus: "active",
        actorId: "staff-1",
      });

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toBe("Network timeout");
      expect(result.data).toBeNull();
    });

    it("handles thrown exceptions", async () => {
      const mockRpc = jest
        .fn()
        .mockRejectedValue(new Error("Connection refused"));

      const supabase = createMockSupabaseClient(mockRpc);

      const result = await updateTableStatus(supabase, {
        casinoId: "casino-1",
        tableId: "table-1",
        newStatus: "active",
        actorId: "staff-1",
      });

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toBe("Connection refused");
      expect(result.data).toBeNull();
    });
  });

  describe("isValidTableDTO", () => {
    it("returns true for valid table DTO", () => {
      const validTable: GamingTable = {
        id: "table-1",
        casino_id: "casino-1",
        label: "Blackjack 1",
        type: "blackjack",
        status: "active",
        pit: "Main Floor",
        created_at: "2025-05-05T10:00:00Z",
      };

      expect(isValidTableDTO(validTable)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isValidTableDTO(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isValidTableDTO(undefined)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(isValidTableDTO("not an object")).toBe(false);
      expect(isValidTableDTO(123)).toBe(false);
      expect(isValidTableDTO(true)).toBe(false);
    });

    it("returns false for missing required fields", () => {
      const invalidTable = {
        id: "table-1",
        casino_id: "casino-1",
        // missing label, type, status
      };

      expect(isValidTableDTO(invalidTable)).toBe(false);
    });

    it("returns false for wrong field types", () => {
      const invalidTable = {
        id: "table-1",
        casino_id: "casino-1",
        label: "Blackjack 1",
        type: "blackjack",
        status: 123, // should be string
        pit: "Main Floor",
        created_at: "2025-05-05T10:00:00Z",
      };

      expect(isValidTableDTO(invalidTable)).toBe(false);
    });

    it("returns false for invalid status enum", () => {
      const invalidTable = {
        id: "table-1",
        casino_id: "casino-1",
        label: "Blackjack 1",
        type: "blackjack",
        status: "invalid-status", // not in enum
        pit: "Main Floor",
        created_at: "2025-05-05T10:00:00Z",
      };

      expect(isValidTableDTO(invalidTable)).toBe(false);
    });

    it("returns true for table with null pit", () => {
      const validTable = {
        id: "table-1",
        casino_id: "casino-1",
        label: "Blackjack 1",
        type: "blackjack",
        status: "inactive",
        pit: null,
        created_at: "2025-05-05T10:00:00Z",
      };

      expect(isValidTableDTO(validTable)).toBe(true);
    });
  });
});
