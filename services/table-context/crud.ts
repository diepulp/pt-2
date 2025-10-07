/**
 * Table Context CRUD Module
 * Following PT-2 canonical service architecture
 * Bounded Context: "What game/table configuration?" (Configuration Domain)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { executeOperation } from "../shared/operation-wrapper";
import type { ServiceResult } from "../shared/types";

// ============================================================================
// DTOs for Gaming Table
// ============================================================================

export interface GamingTableCreateDTO {
  name: string;
  tableNumber: string;
  type: string;
  casinoId: string;
  description?: string;
}

export interface GamingTableUpdateDTO {
  name?: string;
  tableNumber?: string;
  type?: string;
  description?: string;
}

export type GamingTableDTO = Pick<
  Database["public"]["Tables"]["gamingtable"]["Row"],
  | "id"
  | "name"
  | "table_number"
  | "type"
  | "casino_id"
  | "description"
  | "created_at"
  | "updated_at"
>;

// ============================================================================
// CRUD Service Factory
// ============================================================================

export function createTableContextCrudService(
  supabase: SupabaseClient<Database>,
) {
  return {
    /**
     * Create a new gaming table
     * Maps error codes:
     * - 23503: FOREIGN_KEY_VIOLATION (invalid casino_id)
     * - 23505: DUPLICATE_TABLE (if unique constraint exists on table_number)
     */
    create: async (
      data: GamingTableCreateDTO,
    ): Promise<ServiceResult<GamingTableDTO>> => {
      return executeOperation<GamingTableDTO>(
        "create_gaming_table",
        async () => {
          const { data: table, error } = await supabase
            .from("gamingtable")
            .insert({
              name: data.name,
              table_number: data.tableNumber,
              type: data.type,
              casino_id: data.casinoId,
              ...(data.description && { description: data.description }),
            })
            .select(
              "id, name, table_number, type, casino_id, description, created_at, updated_at",
            )
            .single();

          if (error) {
            // Check for foreign key violation (casino_id not found)
            if (error.code === "23503") {
              throw {
                code: "FOREIGN_KEY_VIOLATION",
                message: "Referenced casino does not exist",
                details: error,
              };
            }

            // Check for duplicate table number (if unique constraint exists)
            if (error.code === "23505") {
              throw {
                code: "DUPLICATE_TABLE",
                message: "Table with this table number already exists",
                details: error,
              };
            }

            throw error;
          }

          return table;
        },
      );
    },

    /**
     * Get gaming table by ID
     * Maps error codes:
     * - PGRST116: NOT_FOUND
     */
    getById: async (id: string): Promise<ServiceResult<GamingTableDTO>> => {
      return executeOperation<GamingTableDTO>(
        "get_gaming_table_by_id",
        async () => {
          const { data: table, error } = await supabase
            .from("gamingtable")
            .select(
              "id, name, table_number, type, casino_id, description, created_at, updated_at",
            )
            .eq("id", id)
            .single();

          if (error) {
            // Check for not found error (PGRST116)
            if (error.code === "PGRST116") {
              throw {
                code: "NOT_FOUND",
                message: "Gaming table not found",
                details: error,
              };
            }
            throw error;
          }

          return table;
        },
      );
    },

    /**
     * Update gaming table
     * Maps error codes:
     * - PGRST116: NOT_FOUND
     * - 23505: DUPLICATE_TABLE (if unique constraint exists on table_number)
     */
    update: async (
      id: string,
      data: GamingTableUpdateDTO,
    ): Promise<ServiceResult<GamingTableDTO>> => {
      return executeOperation<GamingTableDTO>(
        "update_gaming_table",
        async () => {
          const { data: table, error } = await supabase
            .from("gamingtable")
            .update({
              ...(data.name !== undefined && { name: data.name }),
              ...(data.tableNumber !== undefined && {
                table_number: data.tableNumber,
              }),
              ...(data.type !== undefined && { type: data.type }),
              ...(data.description !== undefined && {
                description: data.description,
              }),
            })
            .eq("id", id)
            .select(
              "id, name, table_number, type, casino_id, description, created_at, updated_at",
            )
            .single();

          if (error) {
            // Check for not found error (PGRST116)
            if (error.code === "PGRST116") {
              throw {
                code: "NOT_FOUND",
                message: "Gaming table not found",
                details: error,
              };
            }

            // Check for duplicate table number
            if (error.code === "23505") {
              throw {
                code: "DUPLICATE_TABLE",
                message: "Table with this table number already exists",
                details: error,
              };
            }

            throw error;
          }

          return table;
        },
      );
    },

    /**
     * Delete gaming table
     * Maps error codes:
     * - PGRST116: NOT_FOUND
     * - 23503: FOREIGN_KEY_VIOLATION (table has related records)
     */
    delete: async (id: string): Promise<ServiceResult<void>> => {
      return executeOperation<void>("delete_gaming_table", async () => {
        // First check if table exists by trying to get it
        const { data: existingTable, error: getError } = await supabase
          .from("gamingtable")
          .select("id")
          .eq("id", id)
          .maybeSingle();

        if (getError) {
          throw getError;
        }

        // If table doesn't exist, throw NOT_FOUND
        if (!existingTable) {
          throw {
            code: "NOT_FOUND",
            message: "Gaming table not found",
            details: { id },
          };
        }

        // Proceed with deletion
        const { error } = await supabase
          .from("gamingtable")
          .delete()
          .eq("id", id);

        if (error) {
          // Check for foreign key violation (table has related records)
          if (error.code === "23503") {
            throw {
              code: "FOREIGN_KEY_VIOLATION",
              message:
                "Cannot delete table with existing related records (settings, rating slips, etc.)",
              details: error,
            };
          }

          throw error;
        }

        return undefined as void;
      });
    },

    /**
     * List all gaming tables for a casino
     * Returns empty array if casino has no tables
     */
    listByCasino: async (
      casinoId: string,
    ): Promise<ServiceResult<GamingTableDTO[]>> => {
      return executeOperation<GamingTableDTO[]>(
        "list_gaming_tables_by_casino",
        async () => {
          const { data: tables, error } = await supabase
            .from("gamingtable")
            .select(
              "id, name, table_number, type, casino_id, description, created_at, updated_at",
            )
            .eq("casino_id", casinoId)
            .order("table_number", { ascending: true });

          if (error) {
            throw error;
          }

          return tables || [];
        },
      );
    },
  };
}
