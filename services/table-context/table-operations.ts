/**
 * Table Operations Module
 *
 * Purpose: Table lifecycle operations (status updates, transitions)
 * Pattern: Throws DomainError on failure (ADR-012), never returns ServiceResult
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import { getAuthContext } from "@/lib/supabase/rls-context";
import type { Database } from "@/types/database.types";

import { canTransition } from "./table-state-machine";
import { isValidGamingTableDTO, type GamingTableDTO } from "./type-guards";

export type UpdateTableStatusInput = {
  tableId: string;
  newStatus: Database["public"]["Enums"]["table_status"];
};

/**
 * Update gaming table status via RPC
 *
 * Throws:
 * - TABLE_NOT_FOUND: Table does not exist
 * - TABLE_INVALID_TRANSITION: Status transition not allowed
 * - VALIDATION_ERROR: Invalid RPC response shape
 * - INTERNAL_ERROR: RPC execution failed
 *
 * @example
 * ```typescript
 * await updateTableStatus(supabase, 'table-uuid', 'inactive');
 * ```
 */
export async function updateTableStatus(
  supabase: SupabaseClient<Database>,
  tableId: string,
  newStatus: Database["public"]["Enums"]["table_status"],
): Promise<GamingTableDTO> {
  // Get authenticated context (casino_id, actor_id)
  const context = await getAuthContext(supabase);

  // Fetch current table to validate transition
  const { data: currentTable, error: fetchError } = await supabase
    .from("gaming_table")
    .select("status")
    .eq("id", tableId)
    .eq("casino_id", context.casinoId)
    .single();

  if (fetchError || !currentTable) {
    throw new DomainError(
      "TABLE_NOT_FOUND",
      `Table ${tableId} not found in casino ${context.casinoId}`,
      { details: fetchError },
    );
  }

  // Validate state machine transition
  if (!canTransition(currentTable.status, newStatus)) {
    throw new DomainError(
      "TABLE_SETTINGS_INVALID",
      `Invalid table status transition: ${currentTable.status} → ${newStatus}`,
      {
        httpStatus: 422,
        details: {
          currentStatus: currentTable.status,
          requestedStatus: newStatus,
        },
      },
    );
  }

  // Call RPC to update table status
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "rpc_update_table_status",
    {
      p_actor_id: context.actorId,
      p_casino_id: context.casinoId,
      p_table_id: tableId,
      p_new_status: newStatus,
    },
  );

  if (rpcError) {
    throw new DomainError(
      "INTERNAL_ERROR",
      `Failed to update table status: ${rpcError.message}`,
      {
        httpStatus: 500,
        details: rpcError,
      },
    );
  }

  // Validate RPC response shape using type guard (NO `as` casting)
  if (!isValidGamingTableDTO(rpcData)) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "RPC returned invalid table data shape",
      {
        httpStatus: 500,
        details: { received: rpcData },
      },
    );
  }

  return rpcData;
}
