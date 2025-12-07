/**
 * VisitService Factory
 *
 * Functional factory for visit session management.
 * Pattern B: Canonical CRUD with typed interface.
 *
 * Key invariants:
 * - Identified players can only have ONE active visit per casino at a time
 * - startVisit is idempotent (returns existing active visit if present)
 * - closeVisit sets ended_at timestamp
 * - Ghost gaming visits (no player_id) allow multiple active visits per casino
 *
 * Visit Archetypes (EXEC-VSE-001):
 * - reward_identified: Player exists, no gaming, redemptions only
 * - gaming_identified_rated: Player exists, gaming, loyalty accrual eligible
 * - gaming_ghost_unrated: No player, gaming, compliance tracking only
 *
 * @see PRD-003 Player & Visit Management
 * @see PRD-003B-visit-service-refactor.md
 * @see EXEC-VSE-001 Visit Service Evolution
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 308-350
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  ActiveVisitDTO,
  CloseVisitDTO,
  CreateGhostGamingVisitDTO,
  VisitDTO,
  VisitListFilters,
  VisitWithPlayerDTO,
} from './dtos';

// Re-export DTOs, keys, and HTTP fetchers for consumers
export * from './dtos';
export * from './http';
export * from './keys';

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
   * Defaults to visit_kind = 'gaming_identified_rated'.
   *
   * @deprecated Use createGamingVisit or createRewardVisit for explicit archetypes.
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

  // === Typed Visit Creation (EXEC-VSE-001 WS-3) ===

  /**
   * Create a reward-only visit for an identified player.
   * Visit kind: 'reward_identified' - for comps, vouchers, customer care.
   * Idempotent - returns existing active visit if one exists.
   *
   * @param playerId - Player UUID (required)
   * @param casinoId - Casino UUID (from middleware context)
   */
  createRewardVisit(playerId: string, casinoId: string): Promise<VisitDTO>;

  /**
   * Create a gaming visit for an identified player.
   * Visit kind: 'gaming_identified_rated' - standard rated play.
   * Idempotent - returns existing active visit if one exists.
   *
   * @param playerId - Player UUID (required)
   * @param casinoId - Casino UUID (from middleware context)
   */
  createGamingVisit(playerId: string, casinoId: string): Promise<VisitDTO>;

  /**
   * Create a ghost gaming visit (anonymous player).
   * Visit kind: 'gaming_ghost_unrated' - for compliance tracking.
   * NOT idempotent - multiple ghost visits allowed per casino.
   *
   * @param casinoId - Casino UUID (from middleware context)
   * @param input - Ghost visit input with table_id and optional notes
   */
  createGhostGamingVisit(
    casinoId: string,
    input: CreateGhostGamingVisitDTO,
  ): Promise<VisitDTO>;

  /**
   * Convert a reward visit to a gaming visit.
   * Only allowed on active visits with visit_kind = 'reward_identified'.
   * Transitions to visit_kind = 'gaming_identified_rated'.
   *
   * Use case: Player came in for rewards, decided to play.
   *
   * @param visitId - Visit UUID to convert
   */
  convertRewardToGaming(visitId: string): Promise<VisitDTO>;
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
    // Read operations
    list: (filters) => crud.listVisits(supabase, filters),
    getById: (visitId) => crud.getVisitById(supabase, visitId),
    getActiveForPlayer: (playerId) =>
      crud.getActiveVisitForPlayer(supabase, playerId),

    // Legacy write operations (backward compatible)
    startVisit: (playerId, casinoId) =>
      crud.startVisit(supabase, playerId, casinoId),
    closeVisit: (visitId, input) => crud.closeVisit(supabase, visitId, input),

    // Typed visit creation (EXEC-VSE-001 WS-3)
    createRewardVisit: (playerId, casinoId) =>
      crud.createRewardVisit(supabase, playerId, casinoId),
    createGamingVisit: (playerId, casinoId) =>
      crud.createGamingVisit(supabase, playerId, casinoId),
    createGhostGamingVisit: (casinoId, input) =>
      crud.createGhostGamingVisit(supabase, casinoId, input),
    convertRewardToGaming: (visitId) =>
      crud.convertRewardToGaming(supabase, visitId),
  };
}
