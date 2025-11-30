/**
 * CasinoService React Query Key Factories
 *
 * Uses .scope pattern for surgical cache invalidation.
 * All list operations include scope for partial invalidation.
 *
 * @see SPEC-PRD-000-casino-foundation.md section 6.1
 */

import { serializeKeyFilters } from "@/services/shared/key-utils";

import type { CasinoListFilters, CasinoStaffFilters } from "./dtos";

// Re-export filter types for convenience
export type { CasinoListFilters, CasinoStaffFilters } from "./dtos";

const ROOT = ["casino"] as const;

export const casinoKeys = {
  /** Root key for all casino queries */
  root: ROOT,

  // === Casino CRUD ===

  /**
   * List casinos with optional filters.
   * Includes .scope for surgical invalidation of all list queries.
   */
  list: Object.assign(
    (filters: CasinoListFilters = {}) =>
      [...ROOT, "list", serializeKeyFilters(filters)] as const,
    { scope: [...ROOT, "list"] as const },
  ),

  /** Single casino detail by ID */
  detail: (casinoId: string) => [...ROOT, "detail", casinoId] as const,

  // === Casino Settings ===

  /**
   * Casino settings (RLS-scoped to authenticated user's casino).
   * No casinoId parameter - relies on server-side RLS context.
   */
  settings: () => [...ROOT, "settings"] as const,

  // === Staff ===

  /**
   * Staff list with optional filters.
   * Includes .scope for surgical invalidation of all staff queries.
   */
  staff: Object.assign(
    (filters: CasinoStaffFilters = {}) =>
      [...ROOT, "staff", serializeKeyFilters(filters)] as const,
    { scope: [...ROOT, "staff"] as const },
  ),

  // === Gaming Day ===

  /**
   * Gaming day computation result.
   * @param timestamp - Optional ISO timestamp (defaults to 'now')
   */
  gamingDay: (timestamp?: string) =>
    [...ROOT, "gaming-day", timestamp ?? "now"] as const,
};
