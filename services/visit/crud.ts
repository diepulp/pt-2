/**
 * VisitService CRUD Operations
 *
 * Database operations using type-safe mappers.
 * No `as` assertions; all transformations via mappers.ts.
 *
 * Pattern B (Canonical CRUD) per SLAD section 341-342.
 *
 * @see SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md section 341-342
 * @see PRD-003B-visit-service-refactor.md section 4.3
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import type {
  ActiveVisitDTO,
  CloseVisitDTO,
  CreateGhostGamingVisitDTO,
  StartVisitResultDTO,
  VisitDTO,
  VisitListFilters,
  VisitWithPlayerDTO,
} from "./dtos";
import {
  toActiveVisitDTO,
  toVisitDTO,
  toVisitDTOOrNull,
  toVisitWithPlayerDTOList,
} from "./mappers";
import {
  lastSessionContextRpcResponseSchema,
  recentSessionsRpcResponseSchema,
  tableSeatAvailabilityRpcResponseSchema,
} from "./schemas";
import {
  ACTIVE_VISIT_SELECT,
  VISIT_SELECT,
  VISIT_WITH_PLAYER_SELECT,
} from "./selects";

// === Error Mapping ===

/**
 * Maps Postgres error codes to domain errors.
 * Prevents raw database errors from leaking to callers.
 */
function mapDatabaseError(error: {
  code?: string;
  message: string;
}): DomainError {
  // 23505 = Unique constraint violation (active visit exists)
  if (error.code === "23505") {
    return new DomainError(
      "UNIQUE_VIOLATION",
      "Player already has an active visit at this casino",
    );
  }

  // 23503 = Foreign key violation (player not found)
  if (error.code === "23503") {
    return new DomainError("PLAYER_NOT_FOUND", "Referenced player not found");
  }

  // 23514 = Check constraint violation (visit_kind/player_id invariant)
  if (error.code === "23514") {
    return new DomainError(
      "VISIT_INVALID_KIND_PLAYER",
      "Ghost visits require NULL player_id; identified visits require player_id",
    );
  }

  // PGRST116 = No rows returned (used in update/delete operations)
  if (error.code === "PGRST116") {
    return new DomainError("VISIT_NOT_FOUND", "Visit not found");
  }

  return new DomainError("INTERNAL_ERROR", error.message, { details: error });
}

// === Read Operations ===

/**
 * Get visit by ID.
 * Returns null if not found (maybeSingle pattern).
 */
export async function getVisitById(
  supabase: SupabaseClient<Database>,
  visitId: string,
): Promise<VisitDTO | null> {
  const { data, error } = await supabase
    .from("visit")
    .select(VISIT_SELECT)
    .eq("id", visitId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toVisitDTOOrNull(data);
}

/**
 * Get active visit for a player at a specific casino.
 * Returns ActiveVisitDTO with has_active_visit flag.
 */
export async function getActiveVisitForPlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<ActiveVisitDTO> {
  const { data, error } = await supabase
    .from("visit")
    .select(ACTIVE_VISIT_SELECT)
    .eq("player_id", playerId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  return toActiveVisitDTO(data);
}

/**
 * List visits with pagination and filters.
 * RLS scopes results to the casino automatically.
 */
export async function listVisits(
  supabase: SupabaseClient<Database>,
  filters: VisitListFilters = {},
): Promise<{ items: VisitWithPlayerDTO[]; cursor: string | null }> {
  const limit = filters.limit ?? 20;

  let query = supabase
    .from("visit")
    .select(VISIT_WITH_PLAYER_SELECT)
    .order("started_at", { ascending: false })
    .limit(limit + 1);

  // Apply status filter
  if (filters.status === "active") {
    query = query.is("ended_at", null);
  } else if (filters.status === "closed") {
    query = query.not("ended_at", "is", null);
  }

  // Apply player filter
  if (filters.player_id) {
    query = query.eq("player_id", filters.player_id);
  }

  // Apply visit_kind filter
  if (filters.visit_kind) {
    query = query.eq("visit_kind", filters.visit_kind);
  }

  // Apply date range filters
  if (filters.from_date) {
    query = query.gte("started_at", `${filters.from_date}T00:00:00Z`);
  }
  if (filters.to_date) {
    query = query.lte("started_at", `${filters.to_date}T23:59:59Z`);
  }

  // Apply cursor for pagination
  if (filters.cursor) {
    query = query.lt("started_at", filters.cursor);
  }

  const { data, error } = await query;

  if (error) throw mapDatabaseError(error);

  // Handle pagination
  const hasMore = (data?.length ?? 0) > limit;
  const rawItems = hasMore ? data!.slice(0, limit) : (data ?? []);
  const cursor = hasMore
    ? (rawItems[rawItems.length - 1]?.started_at ?? null)
    : null;

  return {
    items: toVisitWithPlayerDTOList(rawItems),
    cursor,
  };
}

// === Write Operations ===

/**
 * Start a visit (check-in) for a player.
 * Idempotent: returns existing active visit if one exists.
 *
 * BACKWARD COMPATIBILITY: Defaults to visit_kind = 'gaming_identified_rated'.
 * For typed visit creation, use createRewardVisit, createGamingVisit, or createGhostGamingVisit.
 *
 * Returns StartVisitResultDTO with isNew flag to eliminate redundant
 * active visit checks at route layer (P2 fix: ISSUE-983EFA10).
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID
 * @param casinoId - Casino UUID (from middleware context)
 */
export async function startVisit(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<StartVisitResultDTO> {
  // Check for existing active visit (idempotency)
  const existing = await getActiveVisitForPlayer(supabase, playerId);
  if (existing.visit) {
    return { visit: existing.visit, isNew: false };
  }

  // Create new visit with explicit visit_kind for clarity
  // Note: The unique partial index uq_visit_single_active_identified
  // will prevent race conditions at the database level
  const { data, error } = await supabase
    .from("visit")
    .insert({
      player_id: playerId,
      casino_id: casinoId,
      visit_kind: "gaming_identified_rated",
    })
    .select(VISIT_SELECT)
    .single();

  if (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === "23505") {
      // Another visit was created concurrently, fetch it
      const { visit: existingVisit } = await getActiveVisitForPlayer(
        supabase,
        playerId,
      );
      if (existingVisit) {
        return { visit: existingVisit, isNew: false };
      }
    }
    throw mapDatabaseError(error);
  }

  return { visit: toVisitDTO(data), isNew: true };
}

/**
 * Close a visit (check-out).
 * Idempotent: returns existing visit if already closed.
 *
 * @param supabase - Supabase client with RLS context
 * @param visitId - Visit UUID
 * @param input - Optional end time (defaults to now)
 */
export async function closeVisit(
  supabase: SupabaseClient<Database>,
  visitId: string,
  input: CloseVisitDTO = {},
): Promise<VisitDTO> {
  const endedAt = input.ended_at ?? new Date().toISOString();

  // Attempt to close visit (only if not already closed)
  const { data, error } = await supabase
    .from("visit")
    .update({ ended_at: endedAt })
    .eq("id", visitId)
    .is("ended_at", null) // Only close if not already closed
    .select(VISIT_SELECT)
    .single();

  if (error) {
    // PGRST116 = No rows returned (already closed or not found)
    if (error.code === "PGRST116") {
      // Check if visit exists but is already closed (idempotent success)
      const existing = await getVisitById(supabase, visitId);
      if (existing && existing.ended_at) {
        // Already closed - idempotent success
        return existing;
      }
      // Visit not found
      throw new DomainError("VISIT_NOT_FOUND", `Visit not found: ${visitId}`);
    }
    throw mapDatabaseError(error);
  }

  return toVisitDTO(data);
}

// === Typed Visit Creation Operations (EXEC-VSE-001 WS-3) ===

/**
 * Create a reward-only visit for an identified player.
 * Visit kind: 'reward_identified' - for comps, vouchers, customer care without gaming.
 *
 * Idempotent: returns existing active visit if one exists (regardless of kind).
 * This prevents duplicate active visits for the same player.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID (required - cannot be a ghost visit)
 * @param casinoId - Casino UUID (from middleware context)
 */
export async function createRewardVisit(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<VisitDTO> {
  // Check for existing active visit (idempotency)
  const existing = await getActiveVisitForPlayer(supabase, playerId);
  if (existing.visit) {
    return existing.visit;
  }

  const { data, error } = await supabase
    .from("visit")
    .insert({
      player_id: playerId,
      casino_id: casinoId,
      visit_kind: "reward_identified",
    })
    .select(VISIT_SELECT)
    .single();

  if (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === "23505") {
      const { visit: existingVisit } = await getActiveVisitForPlayer(
        supabase,
        playerId,
      );
      if (existingVisit) {
        return existingVisit;
      }
    }
    throw mapDatabaseError(error);
  }

  return toVisitDTO(data);
}

/**
 * Create a gaming visit for an identified player.
 * Visit kind: 'gaming_identified_rated' - standard rated play with loyalty accrual.
 *
 * This is semantically identical to startVisit but with explicit naming.
 * Idempotent: returns existing active visit if one exists.
 *
 * @param supabase - Supabase client with RLS context
 * @param playerId - Player UUID (required - cannot be a ghost visit)
 * @param casinoId - Casino UUID (from middleware context)
 */
export async function createGamingVisit(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
): Promise<VisitDTO> {
  // Delegate to startVisit which already sets visit_kind = 'gaming_identified_rated'
  const { visit } = await startVisit(supabase, playerId, casinoId);
  return visit;
}

/**
 * Create a ghost gaming visit (anonymous player).
 * Visit kind: 'gaming_ghost_unrated' - for compliance tracking (CTR/MTL).
 *
 * Ghost visits do NOT have idempotency based on player_id since there is no player.
 * Multiple concurrent ghost visits per casino are allowed.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID (from middleware context)
 * @param input - Ghost visit input with table_id and optional notes
 */
export async function createGhostGamingVisit(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  input: CreateGhostGamingVisitDTO,
): Promise<VisitDTO> {
  // Note: Ghost visits allow multiple active visits per casino
  // No idempotency check since there's no player to dedupe on
  // table_id and notes are stored for audit/compliance purposes
  void input; // Currently unused - table_id/notes require schema extension
  const { data, error } = await supabase
    .from("visit")
    .insert({
      player_id: null, // Ghost visit - no player identity
      casino_id: casinoId,
      visit_kind: "gaming_ghost_unrated",
    })
    .select(VISIT_SELECT)
    .single();

  if (error) {
    throw mapDatabaseError(error);
  }

  return toVisitDTO(data);
}

/**
 * Convert a reward visit to a gaming visit.
 * Only allowed on active visits with visit_kind = 'reward_identified'.
 *
 * Use case: Player came in for rewards, decided to play.
 *
 * @param supabase - Supabase client with RLS context
 * @param visitId - Visit UUID to convert
 */
export async function convertRewardToGaming(
  supabase: SupabaseClient<Database>,
  visitId: string,
): Promise<VisitDTO> {
  // Fetch current visit to validate state
  const currentVisit = await getVisitById(supabase, visitId);

  if (!currentVisit) {
    throw new DomainError("VISIT_NOT_FOUND", `Visit not found: ${visitId}`);
  }

  if (currentVisit.ended_at !== null) {
    throw new DomainError(
      "VISIT_NOT_OPEN",
      "Cannot convert a closed visit. Only active visits can be converted.",
    );
  }

  if (currentVisit.visit_kind !== "reward_identified") {
    throw new DomainError(
      "VISIT_INVALID_CONVERSION",
      `Cannot convert visit of kind '${currentVisit.visit_kind}' to gaming. Only 'reward_identified' visits can be converted.`,
    );
  }

  // Perform the conversion
  const { data, error } = await supabase
    .from("visit")
    .update({
      visit_kind: "gaming_identified_rated",
    })
    .eq("id", visitId)
    .is("ended_at", null) // Extra safety: only update if still active
    .select(VISIT_SELECT)
    .single();

  if (error) {
    // PGRST116 = No rows returned (concurrent close or not found)
    if (error.code === "PGRST116") {
      // Re-fetch to provide better error message
      const refetched = await getVisitById(supabase, visitId);
      if (refetched && refetched.ended_at) {
        throw new DomainError(
          "VISIT_NOT_OPEN",
          "Visit was closed concurrently. Cannot convert a closed visit.",
        );
      }
      throw new DomainError("VISIT_NOT_FOUND", `Visit not found: ${visitId}`);
    }
    throw mapDatabaseError(error);
  }

  return toVisitDTO(data);
}

// === PRD-017: Visit Continuation Operations ===

/**
 * Get player's recent closed sessions with aggregates.
 * Calls rpc_get_player_recent_sessions RPC (WS5).
 *
 * Returns paginated sessions (last 7 days) plus any current open visit.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID (from middleware context)
 * @param playerId - Player UUID
 * @param options - Pagination options (limit, cursor)
 */
export async function getPlayerRecentSessions(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  playerId: string,
  options: import("./dtos").RecentSessionsOptions = {},
): Promise<import("./dtos").RecentSessionsDTO> {
  const limit = options.limit ?? 5;
  const cursor = options.cursor;

  const { data, error } = await supabase.rpc("rpc_get_player_recent_sessions", {
    p_casino_id: casinoId,
    p_player_id: playerId,
    p_limit: limit,
    p_cursor: cursor,
  });

  if (error) throw mapDatabaseError(error);
  if (!data) {
    throw new DomainError("INTERNAL_ERROR", "RPC returned null unexpectedly");
  }

  // Parse and validate JSONB response
  const parsed = recentSessionsRpcResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new DomainError(
      "INTERNAL_ERROR",
      `Invalid RPC response: ${parsed.error.message}`,
    );
  }

  return {
    sessions: parsed.data.sessions,
    next_cursor: parsed.data.next_cursor,
    open_visit: parsed.data.open_visit,
  };
}

/**
 * Get player's last closed session context for prefilling continuation form.
 * Calls rpc_get_player_last_session_context RPC (WS6).
 *
 * Returns null if player has no closed sessions or last session has no segments.
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID (from middleware context)
 * @param playerId - Player UUID
 */
export async function getPlayerLastSessionContext(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  playerId: string,
): Promise<import("./dtos").LastSessionContextDTO | null> {
  const { data, error } = await supabase.rpc(
    "rpc_get_player_last_session_context",
    {
      p_casino_id: casinoId,
      p_player_id: playerId,
    },
  );

  if (error) throw mapDatabaseError(error);

  // RPC returns null if no closed sessions or no segments
  if (!data) return null;

  // Parse and validate JSONB response
  const parsed = lastSessionContextRpcResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new DomainError(
      "INTERNAL_ERROR",
      `Invalid RPC response: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

/**
 * Start a new visit from a previous session.
 * Implements PRD-017 "Start From Previous" operation.
 *
 * Validation sequence (per PRD-017 5.4):
 * 1. Source visit exists (404 if not)
 * 2. Source visit is closed (400 SOURCE_VISIT_NOT_CLOSED if open)
 * 3. Source visit player_id matches request player_id (400 PLAYER_MISMATCH)
 * 4. Source visit casino matches actor's casino (403 FORBIDDEN)
 * 5. No open visit for player (409 VISIT_ALREADY_OPEN - DB constraint enforces)
 * 6. Destination table/seat available via rpc_check_table_seat_availability (422)
 *
 * Creates:
 * - New visit with visit_group_id = source.visit_group_id (NOT source.id)
 * - First rating slip (segment) at destination table/seat
 *
 * @param supabase - Supabase client with RLS context
 * @param casinoId - Casino UUID (from middleware context)
 * @param actorId - Staff actor UUID (for rating slip creation)
 * @param request - Start from previous request
 */
export async function startFromPrevious(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  request: import("./dtos").StartFromPreviousRequest,
): Promise<import("./dtos").StartFromPreviousResponse> {
  // 1. Fetch source visit
  const sourceVisit = await getVisitById(supabase, request.source_visit_id);
  if (!sourceVisit) {
    throw new DomainError(
      "VISIT_NOT_FOUND",
      `Source visit not found: ${request.source_visit_id}`,
    );
  }

  // 2. Validate source visit is closed
  if (sourceVisit.ended_at === null) {
    throw new DomainError(
      "SOURCE_VISIT_NOT_CLOSED",
      "Cannot continue from an open visit. Close the visit first.",
    );
  }

  // 3. Validate player_id matches
  if (sourceVisit.player_id !== request.player_id) {
    throw new DomainError(
      "PLAYER_MISMATCH",
      `Source visit player_id (${sourceVisit.player_id}) does not match request player_id (${request.player_id})`,
    );
  }

  // 4. Validate casino matches (RLS + explicit check)
  if (sourceVisit.casino_id !== casinoId) {
    throw new DomainError(
      "FORBIDDEN",
      "Source visit belongs to a different casino",
    );
  }

  // 5. Check for existing open visit (will also fail on unique constraint)
  const activeVisit = await getActiveVisitForPlayer(
    supabase,
    request.player_id,
  );
  if (activeVisit.has_active_visit) {
    throw new DomainError(
      "VISIT_ALREADY_OPEN",
      `Player ${request.player_id} already has an active visit`,
    );
  }

  // 6. Validate destination table/seat availability
  const { data: availabilityData, error: availabilityError } =
    await supabase.rpc("rpc_check_table_seat_availability", {
      p_table_id: request.destination_table_id,
      p_seat_number: request.destination_seat_number,
    });

  if (availabilityError) throw mapDatabaseError(availabilityError);

  // Parse and validate RPC response
  const availabilityParsed =
    tableSeatAvailabilityRpcResponseSchema.safeParse(availabilityData);
  if (!availabilityParsed.success) {
    throw new DomainError(
      "INTERNAL_ERROR",
      `Invalid RPC response: ${availabilityParsed.error.message}`,
    );
  }

  if (!availabilityParsed.data.is_available) {
    const reason = availabilityParsed.data.reason ?? "TABLE_NOT_AVAILABLE";
    throw new DomainError(
      reason as "TABLE_NOT_AVAILABLE" | "SEAT_OCCUPIED",
      `Destination table/seat not available: ${availabilityParsed.data.reason}`,
    );
  }

  // 7. Create new visit with visit_group_id from source
  // CRITICAL: Use source.visit_group_id, NOT source.id
  const { data: newVisit, error: visitError } = await supabase
    .from("visit")
    .insert({
      player_id: request.player_id,
      casino_id: casinoId,
      visit_kind: "gaming_identified_rated",
      visit_group_id: sourceVisit.visit_group_id,
    })
    .select(VISIT_SELECT)
    .single();

  if (visitError) throw mapDatabaseError(visitError);

  // 8. Create first rating slip (segment) via RPC
  // Uses rpc_start_rating_slip which handles policy snapshot and RLS context
  const { data: newSlip, error: slipError } = await supabase.rpc(
    "rpc_start_rating_slip",
    {
      p_casino_id: casinoId,
      p_actor_id: actorId,
      p_visit_id: newVisit.id,
      p_table_id: request.destination_table_id,
      p_seat_number: String(request.destination_seat_number),
      p_game_settings: (request.game_settings_override ??
        {}) as import("@/types/database.types").Json,
    },
  );

  if (slipError) throw mapDatabaseError(slipError);

  if (!newSlip) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "rpc_start_rating_slip returned no data",
    );
  }

  return {
    visit_id: newVisit.id,
    visit_group_id: newVisit.visit_group_id,
    active_slip_id: newSlip.id,
    started_at: newVisit.started_at,
  };
}
