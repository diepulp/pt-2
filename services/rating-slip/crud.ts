/**
 * RatingSlipService CRUD Operations
 *
 * RPC-backed state machine operations for rating slip lifecycle.
 * Uses type-safe mappers for all Row to DTO transformations.
 *
 * Pattern B (Canonical CRUD) per SLAD section 341-342.
 *
 * IMPORTANT: player_id is NOT used. Per SRM v4.0.0 invariant,
 * player identity is derived from visit.player_id at query time.
 *
 * @see PRD-002 Rating Slip Service
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 341-342
 * @see EXECUTION-SPEC-PRD-002.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
// Note: VisitLiveViewDTO is now accessed via the mapper
import type { Database } from "@/types/database.types";

import type {
  CloseRatingSlipInput,
  CreateRatingSlipInput,
  MoveRatingSlipInput,
  MoveRatingSlipResult,
  RatingSlipDTO,
  RatingSlipListFilters,
  RatingSlipWithDurationDTO,
  RatingSlipWithPausesDTO,
} from "./dtos";
import {
  toRatingSlipDTO,
  toRatingSlipDTOList,
  toRatingSlipWithDurationDTO,
  toRatingSlipWithPausesDTO,
  toVisitLiveViewDTOOrNull,
} from "./mappers";
import { RATING_SLIP_SELECT, RATING_SLIP_WITH_PAUSES_SELECT } from "./selects";

// === Error Mapping ===

/**
 * Maps Postgres error codes and RPC error messages to domain errors.
 * Prevents raw database errors from leaking to callers.
 */
function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  const message = error.message || "";

  // Handle RPC-raised exceptions
  if (message.includes("RATING_SLIP_NOT_FOUND")) {
    return new DomainError("RATING_SLIP_NOT_FOUND", "Rating slip not found");
  }

  if (message.includes("RATING_SLIP_NOT_OPEN")) {
    return new DomainError(
      "RATING_SLIP_NOT_OPEN",
      "Rating slip is not in open state",
    );
  }

  if (message.includes("RATING_SLIP_NOT_PAUSED")) {
    return new DomainError(
      "RATING_SLIP_NOT_PAUSED",
      "Rating slip is not in paused state",
    );
  }

  if (message.includes("RATING_SLIP_ALREADY_CLOSED")) {
    return new DomainError(
      "RATING_SLIP_ALREADY_CLOSED",
      "Rating slip has already been closed",
    );
  }

  if (message.includes("VISIT_NOT_OPEN")) {
    return new DomainError(
      "VISIT_NOT_OPEN",
      "Visit is not active. Cannot start rating slip.",
    );
  }

  if (message.includes("TABLE_NOT_ACTIVE")) {
    return new DomainError(
      "TABLE_NOT_ACTIVE",
      "Gaming table is not active. Cannot start rating slip.",
    );
  }

  // Handle Postgres error codes
  // 23505 = Unique constraint violation
  if (error.code === "23505") {
    // Check for seat occupancy constraint (idx_rating_slip_active_seat_unique)
    if (
      message.includes("idx_rating_slip_active_seat_unique") ||
      message.includes("seat_number")
    ) {
      return new DomainError(
        "SEAT_OCCUPIED",
        "This seat already has an active rating slip. Please choose a different seat or close the existing slip.",
      );
    }
    // Default: duplicate slip for visit/table
    return new DomainError(
      "RATING_SLIP_DUPLICATE",
      "An open rating slip already exists for this visit at this table",
    );
  }

  // 23503 = Foreign key violation (visit or table not found)
  if (error.code === "23503") {
    if (message.includes("visit_id")) {
      return new DomainError("VISIT_NOT_FOUND", "Referenced visit not found");
    }
    if (message.includes("table_id")) {
      return new DomainError("TABLE_NOT_FOUND", "Referenced table not found");
    }
    return new DomainError(
      "FOREIGN_KEY_VIOLATION",
      "Referenced resource not found",
    );
  }

  // PGRST116 = No rows returned (not found)
  if (error.code === "PGRST116") {
    return new DomainError("RATING_SLIP_NOT_FOUND", "Rating slip not found");
  }

  return new DomainError("INTERNAL_ERROR", error.message, { details: error });
}

// === State Machine Operations (RPC-backed) ===

/**
 * Start a new rating slip for a visit at a table.
 * Uses rpc_start_rating_slip with FOR UPDATE locking and self-injected RLS context.
 *
 * Pre-validates visit state before calling RPC to provide better error messages.
 * The RPC derives player_id from visit internally (ADR-015 Phase 1A).
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID (from middleware context)
 * @param actorId - Staff actor UUID (from session)
 * @param input - CreateRatingSlipInput (visit_id, table_id, seat_number?, game_settings?)
 * @returns RatingSlipDTO
 * @throws RATING_SLIP_DUPLICATE if slip already exists for visit/table
 * @throws VISIT_NOT_OPEN if visit is not active
 * @throws TABLE_NOT_ACTIVE if table is not active
 */
export async function start(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  input: CreateRatingSlipInput,
): Promise<RatingSlipDTO> {
  // Pre-validate visit before calling RPC for better error handling
  const { data: visitData, error: visitError } = await supabase
    .from("visit")
    .select("id, player_id, ended_at, casino_id")
    .eq("id", input.visit_id)
    .maybeSingle();

  if (visitError) throw mapDatabaseError(visitError);

  if (!visitData) {
    throw new DomainError(
      "VISIT_NOT_FOUND",
      `Visit not found: ${input.visit_id}`,
    );
  }

  if (visitData.ended_at !== null) {
    throw new DomainError(
      "VISIT_NOT_OPEN",
      "Visit is not active. Cannot start rating slip.",
    );
  }

  if (visitData.casino_id !== casinoId) {
    throw new DomainError(
      "VISIT_CASINO_MISMATCH",
      "Visit does not belong to the specified casino",
    );
  }

  // Note: Ghost visits (player_id = null) CAN have rating slips per ADR-014.
  // Rating slips for ghost visits provide compliance-only telemetry for
  // finance, MTL, and AML tracking. LoyaltyService checks for ghost visits
  // at accrual time and excludes them from automated point calculation.

  const { data, error } = await supabase.rpc("rpc_start_rating_slip", {
    p_casino_id: casinoId,
    p_actor_id: actorId,
    p_visit_id: input.visit_id,
    p_table_id: input.table_id,
    p_seat_number: input.seat_number ?? "",
    p_game_settings: input.game_settings ?? {},
    // Note: p_player_id removed per ADR-015 Phase 1A migration 20251213190000
    // The RPC now derives player_id from visit.player_id internally
  });

  if (error) throw mapDatabaseError(error);

  // RPC returns a single record
  if (!data) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "rpc_start_rating_slip returned no data",
    );
  }

  return toRatingSlipDTO(data);
}

/**
 * Pause an open rating slip.
 * Uses rpc_pause_rating_slip which has FOR UPDATE locking.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID
 * @param actorId - Staff actor UUID
 * @param slipId - Rating slip UUID
 * @returns RatingSlipDTO with status 'paused'
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 * @throws RATING_SLIP_NOT_OPEN if slip is not in open state
 */
export async function pause(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  slipId: string,
): Promise<RatingSlipDTO> {
  const { data, error } = await supabase.rpc("rpc_pause_rating_slip", {
    p_casino_id: casinoId,
    p_actor_id: actorId,
    p_rating_slip_id: slipId,
  });

  if (error) throw mapDatabaseError(error);

  if (!data) {
    throw new DomainError(
      "RATING_SLIP_NOT_FOUND",
      `Rating slip not found: ${slipId}`,
    );
  }

  return toRatingSlipDTO(data);
}

/**
 * Resume a paused rating slip.
 * Uses rpc_resume_rating_slip which has FOR UPDATE locking.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID
 * @param actorId - Staff actor UUID
 * @param slipId - Rating slip UUID
 * @returns RatingSlipDTO with status 'open'
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 * @throws RATING_SLIP_NOT_PAUSED if slip is not in paused state
 */
export async function resume(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  slipId: string,
): Promise<RatingSlipDTO> {
  const { data, error } = await supabase.rpc("rpc_resume_rating_slip", {
    p_casino_id: casinoId,
    p_actor_id: actorId,
    p_rating_slip_id: slipId,
  });

  if (error) throw mapDatabaseError(error);

  if (!data) {
    throw new DomainError(
      "RATING_SLIP_NOT_FOUND",
      `Rating slip not found: ${slipId}`,
    );
  }

  return toRatingSlipDTO(data);
}

/**
 * Close a rating slip (terminal state).
 * Uses rpc_close_rating_slip which returns duration and slip.
 * PRD-016: Updates final_duration_seconds on the closed slip for continuity tracking.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID
 * @param actorId - Staff actor UUID
 * @param slipId - Rating slip UUID
 * @param input - Optional CloseRatingSlipInput (average_bet)
 * @returns RatingSlipWithDurationDTO with calculated duration_seconds
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 * @throws RATING_SLIP_INVALID_STATE if slip is already closed
 */
export async function close(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  slipId: string,
  input: CloseRatingSlipInput = {},
): Promise<RatingSlipWithDurationDTO> {
  const { data, error } = await supabase.rpc("rpc_close_rating_slip", {
    p_casino_id: casinoId,
    p_actor_id: actorId,
    p_rating_slip_id: slipId,
    p_average_bet: input.average_bet,
  });

  if (error) throw mapDatabaseError(error);

  // rpc_close_rating_slip returns an array with { slip, duration_seconds }
  // Need to handle both array and single result based on RPC return type
  const result = Array.isArray(data) ? data[0] : data;

  if (!result) {
    throw new DomainError(
      "RATING_SLIP_NOT_FOUND",
      `Rating slip not found: ${slipId}`,
    );
  }

  // PRD-016: Set final_duration_seconds on the closed slip
  // This field is used by move() to calculate accumulated_seconds for the next slip
  const { error: updateError } = await supabase
    .from("rating_slip")
    .update({ final_duration_seconds: result.duration_seconds })
    .eq("id", slipId);

  if (updateError) throw mapDatabaseError(updateError);

  // The RPC returns { slip: RatingSlipRow, duration_seconds: number }
  return toRatingSlipWithDurationDTO(result.slip, result.duration_seconds);
}

// === Read Operations ===

/**
 * Get a rating slip by ID with pause history.
 * Uses query with pause join for RatingSlipWithPausesDTO.
 *
 * @param supabase - Supabase client with RLS context
 * @param slipId - Rating slip UUID
 * @returns RatingSlipWithPausesDTO with pauses array
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 */
export async function getById(
  supabase: SupabaseClient<Database>,
  slipId: string,
): Promise<RatingSlipWithPausesDTO> {
  const { data, error } = await supabase
    .from("rating_slip")
    .select(RATING_SLIP_WITH_PAUSES_SELECT)
    .eq("id", slipId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);

  if (!data) {
    throw new DomainError(
      "RATING_SLIP_NOT_FOUND",
      `Rating slip not found: ${slipId}`,
    );
  }

  return toRatingSlipWithPausesDTO(data);
}

/**
 * List rating slips for a table with optional filters.
 * RLS scopes results to the casino automatically.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @param filters - Optional list filters (status, limit, cursor)
 * @returns Array of RatingSlipDTO
 */
export async function listForTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
  filters: Omit<RatingSlipListFilters, "table_id" | "visit_id"> = {},
): Promise<{ items: RatingSlipDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from("rating_slip")
    .select(RATING_SLIP_SELECT)
    .eq("table_id", tableId)
    .order("start_time", { ascending: false })
    .limit(limit + 1);

  // Apply status filter
  // PRD-020: 'active' is alias for open+paused
  if (filters.status) {
    if (filters.status === "active") {
      query = query.in("status", ["open", "paused"]);
    } else {
      query = query.eq("status", filters.status);
    }
  }

  // Apply cursor for pagination
  if (filters.cursor) {
    query = query.lt("start_time", filters.cursor);
  }

  const { data, error } = await query;

  if (error) throw mapDatabaseError(error);

  // Handle pagination
  const hasMore = (data?.length ?? 0) > limit;
  const rawItems = hasMore ? data!.slice(0, limit) : (data ?? []);
  const cursor = hasMore
    ? (rawItems[rawItems.length - 1]?.start_time ?? null)
    : null;

  return {
    items: toRatingSlipDTOList(rawItems),
    cursor,
  };
}

/**
 * List rating slips for a visit.
 * Returns all slips associated with a visit session.
 *
 * @param supabase - Supabase client with RLS context
 * @param visitId - Visit UUID
 * @returns Array of RatingSlipDTO
 */
export async function listForVisit(
  supabase: SupabaseClient<Database>,
  visitId: string,
): Promise<RatingSlipDTO[]> {
  const { data, error } = await supabase
    .from("rating_slip")
    .select(RATING_SLIP_SELECT)
    .eq("visit_id", visitId)
    .order("start_time", { ascending: false });

  if (error) throw mapDatabaseError(error);

  return toRatingSlipDTOList(data ?? []);
}

/**
 * Get active (open or paused) rating slips for a table.
 * Used for pit boss view of current table activity.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableId - Gaming table UUID
 * @returns Array of RatingSlipDTO with status 'open' or 'paused'
 */
export async function getActiveForTable(
  supabase: SupabaseClient<Database>,
  tableId: string,
): Promise<RatingSlipDTO[]> {
  const { data, error } = await supabase
    .from("rating_slip")
    .select(RATING_SLIP_SELECT)
    .eq("table_id", tableId)
    .in("status", ["open", "paused"])
    .order("start_time", { ascending: false });

  if (error) throw mapDatabaseError(error);

  return toRatingSlipDTOList(data ?? []);
}

/**
 * Get active play duration for a rating slip.
 * Uses rpc_get_rating_slip_duration which excludes paused intervals.
 *
 * @param supabase - Supabase client with RLS context
 * @param slipId - Rating slip UUID
 * @param asOf - Optional timestamp to calculate duration as of (defaults to now)
 * @returns Duration in seconds (excludes paused time)
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 */
export async function getDuration(
  supabase: SupabaseClient<Database>,
  slipId: string,
  asOf?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("rpc_get_rating_slip_duration", {
    p_rating_slip_id: slipId,
    p_as_of: asOf,
  });

  if (error) throw mapDatabaseError(error);

  if (data === null || data === undefined) {
    throw new DomainError(
      "RATING_SLIP_NOT_FOUND",
      `Rating slip not found: ${slipId}`,
    );
  }

  return data;
}

// === Update Operations ===

/**
 * List all rating slips with optional status filter.
 * RLS scopes results to the casino automatically.
 * Used for dashboard aggregate counts.
 *
 * @param supabase - Supabase client with RLS context
 * @param filters - Optional list filters (status, limit, cursor)
 * @returns Paginated list of RatingSlipDTO
 */
export async function listAll(
  supabase: SupabaseClient<Database>,
  filters: Omit<RatingSlipListFilters, "table_id" | "visit_id"> = {},
): Promise<{ items: RatingSlipDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from("rating_slip")
    .select(RATING_SLIP_SELECT)
    .order("start_time", { ascending: false })
    .limit(limit + 1);

  // Apply status filter
  // PRD-020: 'active' is alias for open+paused
  if (filters.status) {
    if (filters.status === "active") {
      query = query.in("status", ["open", "paused"]);
    } else {
      query = query.eq("status", filters.status);
    }
  }

  // Apply cursor for pagination
  if (filters.cursor) {
    query = query.lt("start_time", filters.cursor);
  }

  const { data, error } = await query;

  if (error) throw mapDatabaseError(error);

  // Handle pagination
  const hasMore = (data?.length ?? 0) > limit;
  const rawItems = hasMore ? data!.slice(0, limit) : (data ?? []);
  const cursor = hasMore
    ? (rawItems[rawItems.length - 1]?.start_time ?? null)
    : null;

  return {
    items: toRatingSlipDTOList(rawItems),
    cursor,
  };
}

/**
 * Update average bet on an open or paused slip.
 * Can be updated before close.
 *
 * @param supabase - Supabase client with RLS context
 * @param slipId - Rating slip UUID
 * @param averageBet - New average bet amount
 * @returns Updated RatingSlipDTO
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 * @throws RATING_SLIP_INVALID_STATE if slip is already closed
 */
export async function updateAverageBet(
  supabase: SupabaseClient<Database>,
  slipId: string,
  averageBet: number,
): Promise<RatingSlipDTO> {
  // Only update if slip is open or paused (not closed)
  const { data, error } = await supabase
    .from("rating_slip")
    .update({ average_bet: averageBet })
    .eq("id", slipId)
    .in("status", ["open", "paused"])
    .select(RATING_SLIP_SELECT)
    .single();

  if (error) {
    // PGRST116 = No rows returned (not found or already closed)
    if (error.code === "PGRST116") {
      // Check if slip exists but is closed
      const { data: existing } = await supabase
        .from("rating_slip")
        .select("id, status")
        .eq("id", slipId)
        .maybeSingle();

      if (existing && existing.status === "closed") {
        throw new DomainError(
          "RATING_SLIP_INVALID_STATE",
          "Cannot update average bet on a closed rating slip",
        );
      }
      throw new DomainError(
        "RATING_SLIP_NOT_FOUND",
        `Rating slip not found: ${slipId}`,
      );
    }
    throw mapDatabaseError(error);
  }

  return toRatingSlipDTO(data);
}

// === Move Operation (PRD-016) ===

/**
 * Move a player's rating slip to a new table.
 * Closes current slip and starts new one with continuity metadata.
 *
 * PRD-016: Implements session continuity by:
 * 1. Closing current slip (sets final_duration_seconds)
 * 2. Starting new slip at new table
 * 3. Populating continuity fields:
 *    - new.previous_slip_id = old.id
 *    - new.move_group_id = old.move_group_id ?? old.id
 *    - new.accumulated_seconds = old.accumulated_seconds + old.final_duration_seconds
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID
 * @param actorId - Staff actor UUID
 * @param slipId - Current rating slip UUID
 * @param input - MoveRatingSlipInput (new_table_id, seat_number?, game_settings?)
 * @returns MoveRatingSlipResult with closed_slip and new_slip
 * @throws RATING_SLIP_NOT_FOUND if slip doesn't exist
 * @throws RATING_SLIP_INVALID_STATE if slip is already closed
 */
export async function move(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  slipId: string,
  input: MoveRatingSlipInput,
): Promise<MoveRatingSlipResult> {
  // 1. Get the current slip with all fields (including continuity metadata)
  const currentSlip = await getById(supabase, slipId);

  // 2. Close the current slip (this sets final_duration_seconds)
  const closedResult = await close(supabase, casinoId, actorId, slipId);

  // 3. Calculate continuity metadata for new slip
  // If move_group_id is null, this is the first move - use current slip ID as group ID
  const moveGroupId = currentSlip.move_group_id ?? currentSlip.id;

  // Accumulated seconds includes all prior segments plus the just-closed segment
  const newAccumulatedSeconds =
    currentSlip.accumulated_seconds + closedResult.duration_seconds;

  // 4. Start new slip at new table
  const newSlip = await start(supabase, casinoId, actorId, {
    visit_id: currentSlip.visit_id,
    table_id: input.new_table_id,
    seat_number: input.new_seat_number,
    game_settings: input.game_settings,
  });

  // 5. Update new slip with continuity metadata
  const { data: updatedSlip, error: updateError } = await supabase
    .from("rating_slip")
    .update({
      previous_slip_id: slipId,
      move_group_id: moveGroupId,
      accumulated_seconds: newAccumulatedSeconds,
    })
    .eq("id", newSlip.id)
    .select(RATING_SLIP_SELECT)
    .single();

  if (updateError) throw mapDatabaseError(updateError);

  return {
    closed_slip: closedResult,
    new_slip: toRatingSlipDTO(updatedSlip),
  };
}

// === Visit Live View (PRD-016) ===

/**
 * Get visit live view with session aggregates.
 * Uses rpc_get_visit_live_view to provide stable "session slip" view.
 *
 * PRD-016: Provides operators with aggregated session view across all slips.
 * ADR-015: Passes casinoId for RLS context self-injection.
 * Returns NULL if visit not found or blocked by RLS.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID for RLS context
 * @param visitId - Visit UUID
 * @param options - Optional includeSegments and segmentsLimit
 * @returns VisitLiveViewDTO with session aggregates, or null if not found
 */
export async function getVisitLiveView(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  visitId: string,
  options?: { includeSegments?: boolean; segmentsLimit?: number },
) {
  // Note: RPC not yet in types because migrations haven't been run on remote
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(
    "rpc_get_visit_live_view",
    {
      p_visit_id: visitId,
      p_include_segments: options?.includeSegments ?? false,
      p_segments_limit: options?.segmentsLimit ?? 10,
      p_casino_id: casinoId,
    },
  );

  if (error) throw mapDatabaseError(error);

  // RPC returns JSONB, which Supabase parses as object
  // Use mapper for type-safe transformation (null if visit not found)
  return toVisitLiveViewDTOOrNull(data);
}

// === Batch Queries ===

/**
 * Batch query for occupied seats across multiple tables.
 * Eliminates N+1 pattern in modal-data endpoint.
 *
 * @param supabase - Supabase client with RLS context
 * @param tableIds - Array of gaming table UUIDs
 * @returns Map of table_id → occupied seat numbers
 */
export async function getOccupiedSeatsByTables(
  supabase: SupabaseClient<Database>,
  tableIds: string[],
): Promise<Map<string, string[]>> {
  if (tableIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("rating_slip")
    .select("table_id, seat_number")
    .in("table_id", tableIds)
    .in("status", ["open", "paused"])
    .not("seat_number", "is", null);

  if (error) throw mapDatabaseError(error);

  // Group by table_id
  const result = new Map<string, string[]>();
  for (const row of data ?? []) {
    const tableId = row.table_id;
    const seatNumber = row.seat_number;
    if (tableId && seatNumber) {
      const seats = result.get(tableId) ?? [];
      seats.push(seatNumber);
      result.set(tableId, seats);
    }
  }
  return result;
}
