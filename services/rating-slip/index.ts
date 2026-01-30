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

import type { VisitLiveViewDTO } from "@/services/visit/dtos";
import type { Database } from "@/types/database.types";

import * as crud from "./crud";
import type {
  ActivePlayerForDashboardDTO,
  CloseRatingSlipInput,
  ClosedSlipCursor,
  ClosedSlipForGamingDayDTO,
  CreateRatingSlipInput,
  MoveRatingSlipInput,
  MoveRatingSlipResult,
  RatingSlipDTO,
  RatingSlipListFilters,
  RatingSlipWithDurationDTO,
  RatingSlipWithPausesDTO,
  SaveWithBuyInInput,
  SaveWithBuyInResult,
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
 * RLS-scoped mutations require casinoId; actorId is required for start/move.
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
   * @param slipId - Rating slip UUID
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_NOT_OPEN if slip is not in open state
   */
  pause(casinoId: string, slipId: string): Promise<RatingSlipDTO>;

  /**
   * Resume a paused rating slip.
   * Uses rpc_resume_rating_slip with FOR UPDATE locking.
   *
   * @param casinoId - Casino UUID
   * @param slipId - Rating slip UUID
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_NOT_PAUSED if slip is not in paused state
   */
  resume(casinoId: string, slipId: string): Promise<RatingSlipDTO>;

  /**
   * Close a rating slip (terminal state).
   * Uses rpc_close_rating_slip which returns duration and slip.
   *
   * @param casinoId - Casino UUID
   * @param slipId - Rating slip UUID
   * @param input - Optional CloseRatingSlipInput (average_bet)
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_INVALID_STATE if slip is already closed
   */
  close(
    casinoId: string,
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

  // === Composite Operations (PERF-005) ===

  /**
   * Atomically update average_bet and record buy-in transaction.
   * Single database roundtrip via composite RPC.
   *
   * PERF-005 WS7: Replaces sequential PATCH + POST pattern.
   *
   * @param slipId - Rating slip UUID
   * @param input - SaveWithBuyInInput (average_bet, buyin_amount_cents?, buyin_type?)
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_NOT_OPEN if slip is already closed
   */
  saveWithBuyIn(
    slipId: string,
    input: SaveWithBuyInInput,
  ): Promise<SaveWithBuyInResult>;

  // === Move Operations (PRD-016) ===

  /**
   * Move a player's rating slip to a new table.
   * Closes current slip and starts new one with continuity metadata.
   *
   * PRD-016: Implements session continuity by linking slips in move chain.
   *
   * @param casinoId - Casino UUID
   * @param actorId - Staff actor UUID
   * @param slipId - Current rating slip UUID
   * @param input - MoveRatingSlipInput (new_table_id, seat_number?)
   * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
   * @throws RATING_SLIP_INVALID_STATE if slip is already closed
   */
  move(
    casinoId: string,
    actorId: string,
    slipId: string,
    input: MoveRatingSlipInput,
  ): Promise<MoveRatingSlipResult>;

  /**
   * Get visit live view with session aggregates.
   *
   * PRD-016: Provides stable "session slip" view to operators.
   * ADR-015: Requires casinoId for RLS context self-injection.
   *
   * @param casinoId - Casino UUID for RLS context
   * @param visitId - Visit UUID
   * @param options - Include segments array, limit
   * @returns VisitLiveViewDTO with session totals, or null if not found
   */
  getVisitLiveView(
    casinoId: string,
    visitId: string,
    options?: { includeSegments?: boolean; segmentsLimit?: number },
  ): Promise<VisitLiveViewDTO | null>;

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

  // === Closed Session Queries (Start From Previous Panel) ===

  /**
   * List closed terminal rating slips for a gaming day.
   * Used by the "Start From Previous" panel to show completed sessions.
   *
   * ISSUE-SFP-001: Uses keyset pagination with (endTime, id) cursor tuple.
   * Only returns terminal slips (excludes intermediate move slips).
   *
   * @param gamingDay - Gaming day in YYYY-MM-DD format
   * @param filters - Optional limit and cursor for keyset pagination
   * @returns Paginated list of ClosedSlipForGamingDayDTO with cursor
   */
  listClosedForGamingDay(
    gamingDay: string,
    filters?: { limit?: number; cursor?: ClosedSlipCursor | null },
  ): Promise<{
    items: ClosedSlipForGamingDayDTO[];
    cursor: ClosedSlipCursor | null;
  }>;

  // === Casino-Wide Active Players (Activity Panel) ===

  /**
   * List active (open/paused) players across all tables in the casino.
   * Used by the Activity Panel for casino-wide player lookup.
   *
   * ADR-024 compliant: RPC derives casino from set_rls_context_from_staff().
   *
   * @param options - Optional search filter and limit
   * @returns Array of ActivePlayerForDashboardDTO
   */
  listActivePlayersCasinoWide(options?: {
    search?: string;
    limit?: number;
  }): Promise<ActivePlayerForDashboardDTO[]>;
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
    pause: (casinoId, slipId) => crud.pause(supabase, casinoId, slipId),
    resume: (casinoId, slipId) => crud.resume(supabase, casinoId, slipId),
    close: (casinoId, slipId, input) =>
      crud.close(supabase, casinoId, slipId, input),

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

    // Composite operations (PERF-005)
    saveWithBuyIn: (slipId, input) =>
      crud.saveWithBuyIn(supabase, slipId, input),

    // Move operations (PRD-016)
    move: (casinoId, actorId, slipId, input) =>
      crud.move(supabase, casinoId, actorId, slipId, input),
    getVisitLiveView: (casinoId, visitId, options) =>
      crud.getVisitLiveView(supabase, casinoId, visitId, options),

    // Published queries (for cross-context consumption)
    hasOpenSlipsForTable: (tableId, casinoId) =>
      hasOpenSlipsForTable(supabase, tableId, casinoId),
    countOpenSlipsForTable: (tableId, casinoId) =>
      countOpenSlipsForTable(supabase, tableId, casinoId),

    // Batch queries
    getOccupiedSeatsByTables: (tableIds) =>
      crud.getOccupiedSeatsByTables(supabase, tableIds),

    // Closed session queries (Start From Previous Panel)
    listClosedForGamingDay: (gamingDay, filters) =>
      crud.listClosedForGamingDay(supabase, gamingDay, filters),

    // Casino-wide active players (Activity Panel)
    listActivePlayersCasinoWide: (options) =>
      crud.listActivePlayersCasinoWide(supabase, options),
  };
}

// Types are re-exported via "export * from './dtos'" above
