/**
 * Rating Slip Lifecycle Operations
 *
 * Implements lifecycle state transitions for rating slips:
 * - start: Create new rating slip (open state)
 * - pause: Pause active gameplay
 * - resume: Resume paused gameplay
 * - close: Finalize rating slip with telemetry
 * - getDuration: Calculate active play duration
 *
 * Pattern: ADR-012 compliant (throws DomainError on failure)
 * RPC Layer: All operations delegate to database RPCs with validation
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

// ============================================================================
// DTOs
// ============================================================================

/**
 * Input for starting a new rating slip
 * Pattern: Contract-First (RPC input mapping)
 */
export type StartRatingSlipInput = {
  playerId: string;
  tableId: string;
  visitId: string;
  seatNumber: string;
  gameSettings: Record<string, unknown>;
};

/**
 * Rating slip data transfer object (full row)
 * Pattern: Canonical (maps to Database type)
 */
export type RatingSlipDTO = Database["public"]["Tables"]["rating_slip"]["Row"];

/**
 * Response from close operation (includes calculated duration)
 * Pattern: Hybrid (extends canonical DTO with RPC-computed field)
 * Note: Named "Response" not "DTO" because duration_seconds is computed, not persisted
 */
export type RatingSlipCloseResponse = RatingSlipDTO & {
  duration_seconds: number;
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Validates RPC response matches RatingSlipDTO shape
 */
export function isValidRatingSlipData(data: unknown): data is RatingSlipDTO {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    typeof obj.id === "string" &&
    typeof obj.player_id === "string" &&
    typeof obj.casino_id === "string" &&
    (obj.visit_id === null || typeof obj.visit_id === "string") &&
    (obj.table_id === null || typeof obj.table_id === "string") &&
    (obj.game_settings === null || typeof obj.game_settings === "object") &&
    (obj.average_bet === null || typeof obj.average_bet === "number") &&
    typeof obj.start_time === "string" &&
    (obj.end_time === null || typeof obj.end_time === "string") &&
    (obj.status === "open" ||
      obj.status === "paused" ||
      obj.status === "closed") &&
    (obj.policy_snapshot === null || typeof obj.policy_snapshot === "object") &&
    (obj.seat_number === null || typeof obj.seat_number === "string")
  );
}

/**
 * Validates close RPC response (array with slip + duration)
 */
export function isValidCloseResponse(
  data: unknown,
): data is { slip: RatingSlipDTO; duration_seconds: number }[] {
  if (!Array.isArray(data) || data.length !== 1) {
    return false;
  }

  const obj = data[0];
  if (!obj || typeof obj !== "object") {
    return false;
  }

  const record = obj as Record<string, unknown>;
  return (
    typeof record.duration_seconds === "number" &&
    record.slip !== null &&
    typeof record.slip === "object" &&
    isValidRatingSlipData(record.slip)
  );
}

/**
 * Validates duration RPC response
 */
export function isValidDurationResponse(data: unknown): data is number {
  return typeof data === "number" && data >= 0;
}

// ============================================================================
// ERROR MAPPING
// ============================================================================

/**
 * Maps RPC error messages to DomainError codes
 */
function mapRpcError(message: string, operation: string): DomainError {
  const lowerMsg = message.toLowerCase();

  // Visit errors
  if (
    lowerMsg.includes("visit") &&
    lowerMsg.includes("not") &&
    lowerMsg.includes("open")
  ) {
    return new DomainError(
      "VISIT_NOT_OPEN",
      "Visit session is not currently open",
    );
  }

  // Table errors
  if (
    lowerMsg.includes("table") &&
    lowerMsg.includes("not") &&
    lowerMsg.includes("active")
  ) {
    return new DomainError("TABLE_NOT_ACTIVE", "Gaming table is not active");
  }

  // Rating slip state errors
  if (lowerMsg.includes("not") && lowerMsg.includes("open")) {
    return new DomainError(
      "RATING_SLIP_NOT_OPEN",
      "Rating slip is not in open state",
    );
  }

  if (lowerMsg.includes("not") && lowerMsg.includes("paused")) {
    return new DomainError(
      "RATING_SLIP_NOT_PAUSED",
      "Rating slip is not in paused state",
    );
  }

  if (
    lowerMsg.includes("duplicate") ||
    (lowerMsg.includes("already") && lowerMsg.includes("active"))
  ) {
    return new DomainError(
      "RATING_SLIP_INVALID_STATE",
      "Player already has an active rating slip",
    );
  }

  if (lowerMsg.includes("invalid") && lowerMsg.includes("state")) {
    return new DomainError(
      "RATING_SLIP_INVALID_STATE",
      "Rating slip is in an invalid state for this operation",
    );
  }

  // Generic fallback
  return new DomainError("INTERNAL_ERROR", `${operation} failed: ${message}`);
}

// ============================================================================
// LIFECYCLE OPERATIONS
// ============================================================================

/**
 * Start a new rating slip
 *
 * Creates a new rating slip in "open" state, capturing game settings
 * and policy snapshot at time of start.
 *
 * @throws {DomainError} VISIT_NOT_OPEN - Visit session is not open
 * @throws {DomainError} TABLE_NOT_ACTIVE - Gaming table is not active
 * @throws {DomainError} RATING_SLIP_INVALID_STATE - Player already has active slip
 */
export async function startSlip(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  input: StartRatingSlipInput,
): Promise<RatingSlipDTO> {
  const { data, error } = await supabase.rpc("rpc_start_rating_slip", {
    p_casino_id: casinoId,
    p_actor_id: actorId,
    p_player_id: input.playerId,
    p_table_id: input.tableId,
    p_visit_id: input.visitId,
    p_seat_number: input.seatNumber,
    p_game_settings:
      input.gameSettings as unknown as Database["public"]["Functions"]["rpc_start_rating_slip"]["Args"]["p_game_settings"],
  });

  if (error) {
    throw mapRpcError(error.message, "Start rating slip");
  }

  if (!isValidRatingSlipData(data)) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "Invalid response from rpc_start_rating_slip",
    );
  }

  return data;
}

/**
 * Pause an open rating slip
 *
 * Pauses active gameplay, creating a pause interval. Rating slip
 * status transitions from "open" to "paused".
 *
 * @throws {DomainError} RATING_SLIP_NOT_OPEN - Can only pause open slips
 * @throws {DomainError} RATING_SLIP_NOT_FOUND - Rating slip does not exist
 */
export async function pauseSlip(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  ratingSlipId: string,
): Promise<RatingSlipDTO> {
  const { data, error } = await supabase.rpc("rpc_pause_rating_slip", {
    p_casino_id: casinoId,
    p_actor_id: actorId,
    p_rating_slip_id: ratingSlipId,
  });

  if (error) {
    throw mapRpcError(error.message, "Pause rating slip");
  }

  if (!isValidRatingSlipData(data)) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "Invalid response from rpc_pause_rating_slip",
    );
  }

  return data;
}

/**
 * Resume a paused rating slip
 *
 * Resumes gameplay after a pause, closing the current pause interval.
 * Rating slip status transitions from "paused" to "open".
 *
 * @throws {DomainError} RATING_SLIP_NOT_PAUSED - Can only resume paused slips
 * @throws {DomainError} RATING_SLIP_NOT_FOUND - Rating slip does not exist
 */
export async function resumeSlip(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  ratingSlipId: string,
): Promise<RatingSlipDTO> {
  const { data, error } = await supabase.rpc("rpc_resume_rating_slip", {
    p_casino_id: casinoId,
    p_actor_id: actorId,
    p_rating_slip_id: ratingSlipId,
  });

  if (error) {
    throw mapRpcError(error.message, "Resume rating slip");
  }

  if (!isValidRatingSlipData(data)) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "Invalid response from rpc_resume_rating_slip",
    );
  }

  return data;
}

/**
 * Close a rating slip with final telemetry
 *
 * Finalizes rating slip, setting end_time and calculating duration.
 * Optionally captures final average bet. If slip is paused, the current
 * pause interval is closed at the same time as the slip.
 *
 * @param averageBet - Optional final average bet (overrides existing value)
 * @returns Rating slip with calculated duration_seconds
 *
 * @throws {DomainError} RATING_SLIP_NOT_FOUND - Rating slip does not exist
 * @throws {DomainError} RATING_SLIP_ALREADY_CLOSED - Slip is already closed
 */
export async function closeSlip(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  actorId: string,
  ratingSlipId: string,
  averageBet?: number,
): Promise<RatingSlipCloseResponse> {
  const { data, error } = await supabase.rpc("rpc_close_rating_slip", {
    p_casino_id: casinoId,
    p_actor_id: actorId,
    p_rating_slip_id: ratingSlipId,
    p_average_bet: averageBet,
  });

  if (error) {
    throw mapRpcError(error.message, "Close rating slip");
  }

  if (!isValidCloseResponse(data)) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "Invalid response from rpc_close_rating_slip",
    );
  }

  const result = data[0];
  return {
    ...result.slip,
    duration_seconds: result.duration_seconds,
  };
}

/**
 * Get active play duration for rating slip
 *
 * Calculates duration in seconds, accounting for pause intervals.
 * If slip is currently paused, calculates up to asOf timestamp.
 *
 * @param asOf - Calculate duration as of this timestamp (ISO-8601)
 * @returns Duration in seconds (excludes paused time)
 *
 * @throws {DomainError} RATING_SLIP_NOT_FOUND - Rating slip does not exist
 */
export async function getDuration(
  supabase: SupabaseClient<Database>,
  ratingSlipId: string,
  asOf?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("rpc_get_rating_slip_duration", {
    p_rating_slip_id: ratingSlipId,
    p_as_of: asOf,
  });

  if (error) {
    throw mapRpcError(error.message, "Get rating slip duration");
  }

  if (!isValidDurationResponse(data)) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "Invalid response from rpc_get_rating_slip_duration",
    );
  }

  return data;
}
