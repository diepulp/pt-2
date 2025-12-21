/**
 * RatingSlipService Factory
 *
 * Functional factory for rating slip lifecycle management.
 * Pattern B: Canonical CRUD with typed interface per ADR-008.
 *
 * Key invariants:
 * - Rating slips are tied to visits (not players directly)
 * - Player identity is derived from visit.player_id
 * - Ghost visits (player_id = null) cannot have rating slips
 * - State machine: open <-> paused -> closed (terminal)
 * - Duration excludes paused intervals
 *
 * @see PRD-002 Rating Slip Service
 * @see EXECUTION-SPEC-PRD-002.md
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 341-342
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import * as crud from "./crud";
import type {
  CloseRatingSlipInput,
  CreateRatingSlipInput,
  RatingSlipDTO,
  RatingSlipListFilters,
  RatingSlipPauseDTO,
  RatingSlipStatus,
  RatingSlipWithDurationDTO,
  RatingSlipWithPausesDTO,
  UpdateAverageBetInput,
} from "./dtos";
import { hasOpenSlipsForTable, countOpenSlipsForTable } from "./queries";

// Re-export DTOs, keys, and queries for consumers
export * from "./dtos";
export * from "./keys";
export { hasOpenSlipsForTable, countOpenSlipsForTable } from "./queries";

// === Service Interface ===

/**
 * RatingSlipService interface - explicit, no ReturnType inference.
 *
 * All methods require casinoId and actorId for RLS context and audit trail.
 */
export interface RatingSlipServiceInterface {
  // === State Machine Operations (RPC-backed) ===

  /**
   * Start a new rating slip for a visit at a table.
   * Uses rpc_start_rating_slip with FOR UPDATE locking.
   *
   * @param casinoId - Casino UUID (from middleware context)
   * @param actorId - Staff actor UUID (from session)
   * @param input - CreateRatingSlipInput (visit_id, table_id, seat_number?, game_settings?)
   * @throws RATING_SLIP_DUPLICATE if slip already exists for visit/table
   * @throws VISIT_NOT_OPEN if visit is not active
   * @throws TABLE_NOT_ACTIVE if table is not active
   * @throws RATING_SLIP_INVALID_STATE if visit is a ghost visit
   */
  start(
    casinoId: string,
    actorId: string,
    input: CreateRatingSlipInput,
  ): Promise<RatingSlipDTO>;

  /**
   * Pause an open rating slip.
   * Uses rpc_pause_rating_slip with FOR UPDATE locking.
   *
   * @param casinoId - Casino UUID
   * @param actorId - Staff actor UUID
   * @param slipId - Rating slip UUID
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_NOT_OPEN if slip is not in open state
   */
  pause(
    casinoId: string,
    actorId: string,
    slipId: string,
  ): Promise<RatingSlipDTO>;

  /**
   * Resume a paused rating slip.
   * Uses rpc_resume_rating_slip with FOR UPDATE locking.
   *
   * @param casinoId - Casino UUID
   * @param actorId - Staff actor UUID
   * @param slipId - Rating slip UUID
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_NOT_PAUSED if slip is not in paused state
   */
  resume(
    casinoId: string,
    actorId: string,
    slipId: string,
  ): Promise<RatingSlipDTO>;

  /**
   * Close a rating slip (terminal state).
   * Uses rpc_close_rating_slip which returns duration and slip.
   *
   * @param casinoId - Casino UUID
   * @param actorId - Staff actor UUID
   * @param slipId - Rating slip UUID
   * @param input - Optional CloseRatingSlipInput (average_bet)
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_INVALID_STATE if slip is already closed
   */
  close(
    casinoId: string,
    actorId: string,
    slipId: string,
    input?: CloseRatingSlipInput,
  ): Promise<RatingSlipWithDurationDTO>;

  // === Read Operations ===

  /**
   * Get a rating slip by ID with pause history.
   *
   * @param slipId - Rating slip UUID
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   */
  getById(slipId: string): Promise<RatingSlipWithPausesDTO>;

  /**
   * List rating slips for a table with optional filters.
   * RLS scopes results to the casino automatically.
   *
   * @param tableId - Gaming table UUID
   * @param filters - Optional list filters (status, limit, cursor)
   */
  listForTable(
    tableId: string,
    filters?: Omit<RatingSlipListFilters, "table_id" | "visit_id">,
  ): Promise<{ items: RatingSlipDTO[]; cursor: string | null }>;

  /**
   * List rating slips for a visit.
   * Returns all slips associated with a visit session.
   *
   * @param visitId - Visit UUID
   */
  listForVisit(visitId: string): Promise<RatingSlipDTO[]>;

  /**
   * Get active (open or paused) rating slips for a table.
   * Used for pit boss view of current table activity.
   *
   * @param tableId - Gaming table UUID
   */
  getActiveForTable(tableId: string): Promise<RatingSlipDTO[]>;

  /**
   * Get active play duration for a rating slip.
   * Uses rpc_get_rating_slip_duration which excludes paused intervals.
   *
   * @param slipId - Rating slip UUID
   * @param asOf - Optional timestamp to calculate duration as of (defaults to now)
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   */
  getDuration(slipId: string, asOf?: string): Promise<number>;

  /**
   * List all rating slips with optional status filter.
   * RLS scopes results to the casino automatically.
   * Used for dashboard aggregate counts.
   *
   * @param filters - Optional list filters (status, limit, cursor)
   */
  listAll(
    filters?: Omit<RatingSlipListFilters, "table_id" | "visit_id">,
  ): Promise<{ items: RatingSlipDTO[]; cursor: string | null }>;

  // === Update Operations ===

  /**
   * Update average bet on an open or paused slip.
   * Can be updated before close.
   *
   * @param slipId - Rating slip UUID
   * @param averageBet - New average bet amount
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_INVALID_STATE if slip is already closed
   */
  updateAverageBet(slipId: string, averageBet: number): Promise<RatingSlipDTO>;

  // === Published Queries (for cross-context consumption) ===

  /**
   * Check if any open/paused rating slips exist for a table.
   * Used by TableContextService to gate table deactivation.
   *
   * @param tableId - Gaming table UUID
   * @param casinoId - Casino UUID for RLS scoping
   */
  hasOpenSlipsForTable(tableId: string, casinoId: string): Promise<boolean>;

  /**
   * Count open/paused rating slips for a table.
   * Useful for UI display or capacity planning.
   *
   * @param tableId - Gaming table UUID
   * @param casinoId - Casino UUID for RLS scoping
   */
  countOpenSlipsForTable(tableId: string, casinoId: string): Promise<number>;

  // === Batch Queries ===

  /**
   * Batch query for occupied seats across multiple tables.
   * Eliminates N+1 pattern in modal-data endpoint.
   *
   * @param tableIds - Array of gaming table UUIDs
   * @returns Map of table_id → occupied seat numbers
   */
  getOccupiedSeatsByTables(tableIds: string[]): Promise<Map<string, string[]>>;
}

// === Service Factory ===

/**
 * Creates a RatingSlipService instance.
 *
 * @param supabase - Supabase client with RLS context set
 */
export function createRatingSlipService(
  supabase: SupabaseClient<Database>,
): RatingSlipServiceInterface {
  return {
    // State machine operations (RPC-backed)
    start: (casinoId, actorId, input) =>
      crud.start(supabase, casinoId, actorId, input),
    pause: (casinoId, actorId, slipId) =>
      crud.pause(supabase, casinoId, actorId, slipId),
    resume: (casinoId, actorId, slipId) =>
      crud.resume(supabase, casinoId, actorId, slipId),
    close: (casinoId, actorId, slipId, input) =>
      crud.close(supabase, casinoId, actorId, slipId, input),

    // Read operations
    getById: (slipId) => crud.getById(supabase, slipId),
    listForTable: (tableId, filters) =>
      crud.listForTable(supabase, tableId, filters),
    listForVisit: (visitId) => crud.listForVisit(supabase, visitId),
    getActiveForTable: (tableId) => crud.getActiveForTable(supabase, tableId),
    getDuration: (slipId, asOf) => crud.getDuration(supabase, slipId, asOf),
    listAll: (filters) => crud.listAll(supabase, filters),

    // Update operations
    updateAverageBet: (slipId, averageBet) =>
      crud.updateAverageBet(supabase, slipId, averageBet),

    // Published queries (for cross-context consumption)
    hasOpenSlipsForTable: (tableId, casinoId) =>
      hasOpenSlipsForTable(supabase, tableId, casinoId),
    countOpenSlipsForTable: (tableId, casinoId) =>
      countOpenSlipsForTable(supabase, tableId, casinoId),

    // Batch queries
    getOccupiedSeatsByTables: (tableIds) =>
      crud.getOccupiedSeatsByTables(supabase, tableIds),
  };
}

// Types are re-exported via "export * from './dtos'" above
