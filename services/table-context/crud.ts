/**
 * TableContextService CRUD Operations
 *
 * Read operations for tables, using mappers (no `as` casting).
 *
 * @see SLAD section 308-348
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import type {
  GamingTableDTO,
  GamingTableWithDealerDTO,
  TableListFilters,
} from "./dtos";
import { toGamingTableDTO, toGamingTableDTOList } from "./mappers";
import { GAMING_TABLE_SELECT } from "./selects";

// === Get Table by ID ===

/**
 * Fetches a single gaming table by ID.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param casinoId - Casino UUID for RLS scoping
 * @returns The gaming table DTO
 * @throws DomainError TABLE_NOT_FOUND if table does not exist
 */
export async function getTableById(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<GamingTableDTO> {
  const { data, error } = await supabase
    .from("gaming_table")
    .select(GAMING_TABLE_SELECT)
    .eq("id", tableId)
    .eq("casino_id", casinoId)
    .single();

  if (error || !data) {
    throw new DomainError("TABLE_NOT_FOUND");
  }

  return toGamingTableDTO(data);
}

// === List Tables with Filters ===

/**
 * Lists gaming tables with optional filters.
 *
 * Supports filtering by status, pit, type, and cursor-based pagination.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID for RLS scoping
 * @param filters - Optional filters (status, pit, type, cursor, limit)
 * @returns Array of gaming table DTOs
 */
export async function listTables(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  filters: Omit<TableListFilters, "casinoId"> = {},
): Promise<GamingTableDTO[]> {
  let query = supabase
    .from("gaming_table")
    .select(GAMING_TABLE_SELECT)
    .eq("casino_id", casinoId)
    .order("created_at", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.pit) {
    query = query.eq("pit", filters.pit);
  }

  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  if (filters.cursor) {
    query = query.lt("created_at", filters.cursor);
  }

  const limit = filters.limit ?? 20;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new DomainError("INTERNAL_ERROR", "Failed to list tables");
  }

  return toGamingTableDTOList(data ?? []);
}

// === Get Active Tables for Casino (Dashboard) ===

/**
 * Fetches all active gaming tables with current dealer information.
 *
 * Used by the Pit Dashboard for real-time table monitoring.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID for RLS scoping
 * @returns Array of gaming tables with dealer DTOs
 */
export async function getActiveTables(
  supabase: SupabaseClient<Database>,
  casinoId: string,
): Promise<GamingTableWithDealerDTO[]> {
  const { data, error } = await supabase
    .from("gaming_table")
    .select(
      `
      id,
      casino_id,
      label,
      pit,
      type,
      status,
      created_at,
      dealer_rotation!left (
        staff_id,
        started_at,
        ended_at
      )
    `,
    )
    .eq("casino_id", casinoId)
    .eq("status", "active")
    .order("label", { ascending: true });

  if (error) {
    throw new DomainError("INTERNAL_ERROR", "Failed to fetch active tables");
  }

  return (data ?? []).map((row) => {
    // Find the active rotation (ended_at is null)
    const activeRotation = row.dealer_rotation?.find(
      (r) => r.ended_at === null,
    );

    return {
      id: row.id,
      casino_id: row.casino_id,
      label: row.label,
      pit: row.pit,
      type: row.type,
      status: row.status,
      created_at: row.created_at,
      current_dealer:
        activeRotation && activeRotation.staff_id
          ? {
              staff_id: activeRotation.staff_id,
              started_at: activeRotation.started_at,
            }
          : null,
    };
  });
}
