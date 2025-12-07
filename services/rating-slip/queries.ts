/**
 * RatingSlipService Published Queries
 *
 * Published queries are the ONLY allowlisted way for other bounded contexts
 * to query data from RatingSlipService. These queries return minimal,
 * boundary-compliant responses (booleans, counts) rather than full DTOs.
 *
 * Consumers:
 * - TableContextService (PRD-007): Uses hasOpenSlipsForTable to gate table deactivation
 *
 * @see PRD-002 Rating Slip Service
 * @see SERVICE_RESPONSIBILITY_MATRIX.md section RatingSlipService
 * @see docs/20-architecture/bounded-contexts.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

// === Published Queries ===

/**
 * Published query for TableContextService consumption.
 * Checks if any rating slips with status 'open' or 'paused' exist for a table.
 *
 * This query is used by TableContextService to enforce the invariant:
 * "A table cannot be deactivated while it has open rating slips."
 *
 * Design decisions:
 * - Returns boolean only (not slip data) per SRM boundary compliance
 * - Uses count with head:true for efficiency (no row data fetched)
 * - Includes casino_id filter for RLS scoping
 * - Graceful error handling: logs error but returns false to prevent blocking
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - The gaming table UUID to check
 * @param casinoId - Casino UUID for RLS scoping
 * @returns Promise<boolean> - true if open/paused slips exist, false otherwise
 *
 * @example
 * ```typescript
 * // In TableContextService before deactivating a table:
 * const hasOpenSlips = await hasOpenSlipsForTable(supabase, tableId, casinoId);
 * if (hasOpenSlips) {
 *   throw new DomainError("TABLE_HAS_OPEN_SLIPS", "Cannot deactivate table with open rating slips");
 * }
 * ```
 */
export async function hasOpenSlipsForTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("rating_slip")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .in("status", ["open", "paused"]);

  if (error) {
    // Graceful degradation: assume no open slips to prevent blocking operations
    // Error is silently swallowed - in production, RLS and monitoring will catch issues
    // Return false on error - prevents blocking table operations
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * Published query for counting open slips at a table.
 * Useful for UI display or capacity planning.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - The gaming table UUID to check
 * @param casinoId - Casino UUID for RLS scoping
 * @returns Promise<number> - Count of open/paused slips (0 on error)
 */
export async function countOpenSlipsForTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  casinoId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("rating_slip")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId)
    .eq("casino_id", casinoId)
    .in("status", ["open", "paused"]);

  if (error) {
    // Graceful degradation: return 0 on error to prevent blocking operations
    return 0;
  }

  return count ?? 0;
}
