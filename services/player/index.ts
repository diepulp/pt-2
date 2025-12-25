/**
 * PlayerService Factory
 *
 * Functional factory for player identity management.
 * Pattern B: Canonical CRUD with typed interface.
 *
 * @see PRD-003 Player & Visit Management
 * @see PRD-003A Pattern B Refactoring
 * @see SERVICE_RESPONSIBILITY_MATRIX.md §814-888
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import * as crud from "./crud";
import type {
  CreatePlayerDTO,
  PlayerDTO,
  PlayerEnrollmentDTO,
  PlayerListFilters,
  PlayerSearchResultDTO,
  UpdatePlayerDTO,
} from "./dtos";

// Re-export DTOs for consumers
export * from "./dtos";
export * from "./keys";
export * from "./http";

// === Service Interface ===

/**
 * PlayerService interface - explicit, no ReturnType inference.
 */
export interface PlayerServiceInterface {
  /**
   * Search players by name with enrollment status.
   * Uses trigram matching for fuzzy search.
   * RLS scopes results to enrolled players in the casino.
   */
  search(query: string, limit?: number): Promise<PlayerSearchResultDTO[]>;

  /**
   * List players with pagination and filters.
   */
  list(filters?: PlayerListFilters): Promise<{
    items: PlayerDTO[];
    cursor: string | null;
  }>;

  /**
   * Get player by ID.
   * Returns null if not found or not enrolled in casino.
   */
  getById(playerId: string): Promise<PlayerDTO | null>;

  /**
   * Create a new player profile.
   */
  create(data: CreatePlayerDTO): Promise<PlayerDTO>;

  /**
   * Update player profile.
   */
  update(playerId: string, data: UpdatePlayerDTO): Promise<PlayerDTO>;

  /**
   * Get player enrollment status in current casino.
   * Returns null if not enrolled.
   *
   * NOTE: Player enrollment is now owned by CasinoService (ADR-022 SLAD fix).
   * Use CasinoService.enrollPlayer() for enrollment operations.
   */
  getEnrollment(playerId: string): Promise<PlayerEnrollmentDTO | null>;
}

// === Service Factory ===

/**
 * Creates a PlayerService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createPlayerService(
  supabase: SupabaseClient<Database>,
): PlayerServiceInterface {
  return {
    search: (query, limit) => crud.searchPlayers(supabase, query, limit),

    list: (filters) => crud.listPlayers(supabase, filters),

    getById: (playerId) => crud.getPlayerById(supabase, playerId),

    create: (input) => crud.createPlayer(supabase, input),

    update: (playerId, input) => crud.updatePlayer(supabase, playerId, input),

    getEnrollment: (playerId) =>
      crud.getPlayerEnrollmentByPlayerId(supabase, playerId),
  };
}
