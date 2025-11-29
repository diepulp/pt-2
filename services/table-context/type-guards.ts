/**
 * Type Guards for TableContextService
 *
 * Purpose: Validate RPC response shapes to avoid `as` casting.
 * Adheres to ADR-012: Services throw DomainError, never return ServiceResult.
 */

import type { Database } from "@/types/database.types";

/**
 * Type guard for RPC rpc_update_table_status return value
 *
 * Expected shape from database.types.ts:
 * {
 *   casino_id: string
 *   created_at: string
 *   id: string
 *   label: string
 *   pit: string | null
 *   status: Database["public"]["Enums"]["table_status"]
 *   type: Database["public"]["Enums"]["game_type"]
 * }
 */
export type GamingTableDTO = {
  casino_id: string;
  created_at: string;
  id: string;
  label: string;
  pit: string | null;
  status: Database["public"]["Enums"]["table_status"];
  type: Database["public"]["Enums"]["game_type"];
};

export function isValidGamingTableDTO(data: unknown): data is GamingTableDTO {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    typeof obj.casino_id === "string" &&
    typeof obj.created_at === "string" &&
    typeof obj.id === "string" &&
    typeof obj.label === "string" &&
    (obj.pit === null || typeof obj.pit === "string") &&
    typeof obj.status === "string" &&
    typeof obj.type === "string"
  );
}
