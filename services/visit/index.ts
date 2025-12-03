/**
 * VisitService Factory
 *
 * Functional factory for visit session management.
 * Pattern B: Canonical CRUD with typed interface.
 *
 * Key invariants:
 * - A player can only have ONE active visit per casino at a time
 * - startVisit is idempotent (returns existing active visit if present)
 * - closeVisit sets ended_at timestamp
 *
 * @see PRD-003 Player & Visit Management
 * @see PRD-003B-visit-service-refactor.md
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 308-350
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import * as crud from "./crud";
import type {
  ActiveVisitDTO,
  CloseVisitDTO,
  VisitDTO,
  VisitListFilters,
  VisitWithPlayerDTO,
} from "./dtos";

// Re-export DTOs, keys, and HTTP fetchers for consumers
export * from "./dtos";
export * from "./http";
export * from "./keys";

// === Service Interface ===

/**
 * VisitService interface - explicit, no ReturnType inference.
 */
export interface VisitServiceInterface {
  /**
   * List visits with pagination and filters.
   * RLS scopes results to the casino.
   */
  list(filters?: VisitListFilters): Promise<{
    items: VisitWithPlayerDTO[];
    cursor: string | null;
  }>;

  /**
   * Get visit by ID.
   * Returns null if not found.
   */
  getById(visitId: string): Promise<VisitDTO | null>;

  /**
   * Get active visit for a player (if any).
   * Returns ActiveVisitDTO with has_active_visit flag.
   */
  getActiveForPlayer(playerId: string): Promise<ActiveVisitDTO>;

  /**
   * Start a visit (check-in) for a player.
   * Idempotent - returns existing active visit if one exists.
   *
   * @param playerId - Player UUID
   * @param casinoId - Casino UUID (from middleware context)
   */
  startVisit(playerId: string, casinoId: string): Promise<VisitDTO>;

  /**
   * Close a visit (check-out).
   * Sets ended_at to current time or provided timestamp.
   * Idempotent - succeeds if already closed.
   */
  closeVisit(visitId: string, input?: CloseVisitDTO): Promise<VisitDTO>;
}

// === Service Factory ===

/**
 * Creates a VisitService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createVisitService(
  supabase: SupabaseClient<Database>,
): VisitServiceInterface {
  return {
    list: (filters) => crud.listVisits(supabase, filters),
    getById: (visitId) => crud.getVisitById(supabase, visitId),
    getActiveForPlayer: (playerId) =>
      crud.getActiveVisitForPlayer(supabase, playerId),
    startVisit: (playerId, casinoId) =>
      crud.startVisit(supabase, playerId, casinoId),
    closeVisit: (visitId, input) => crud.closeVisit(supabase, visitId, input),
  };
}
