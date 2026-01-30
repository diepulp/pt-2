/**
 * RatingSlipService HTTP Fetchers
 *
 * Client-side fetch functions for RatingSlipService API endpoints.
 * Uses fetchJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see PRD-002 Rating Slip Service
 * @see EXECUTION-SPEC-PRD-002.md
 */

import { fetchJSON } from "@/lib/http/fetch-json";
import { IDEMPOTENCY_HEADER } from "@/lib/http/headers";
import { createBrowserComponentClient } from "@/lib/supabase/client";

import type {
  CloseRatingSlipInput,
  ClosedSlipCursor,
  ClosedSlipForGamingDayDTO,
  ClosedTodayResponse,
  CreatePitCashObservationInput,
  CreateRatingSlipInput,
  PitCashObservationDTO,
  RatingSlipDTO,
  RatingSlipListFilters,
  RatingSlipWithDurationDTO,
  RatingSlipWithPausesDTO,
  SaveWithBuyInInput,
  SaveWithBuyInResult,
  UpdateAverageBetInput,
} from "./dtos";

// Re-export types for consumers
export type {
  ClosedSlipCursor,
  ClosedTodayResponse,
  CreatePitCashObservationInput,
  PitCashObservationDTO,
} from "./dtos";

const BASE = "/api/v1/rating-slips";

// === Helper Functions ===

/**
 * Builds URLSearchParams from filter object, excluding undefined/null values.
 */
function buildParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string | number | boolean][];

  return new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

/**
 * Generates a unique idempotency key for mutations.
 */
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// === Rating Slip CRUD ===

/**
 * Starts a new rating slip for a visit at a gaming table.
 * Idempotent - returns existing open slip if one exists for the visit+table.
 *
 * POST /api/v1/rating-slips
 */
export async function startRatingSlip(
  input: CreateRatingSlipInput,
): Promise<RatingSlipDTO> {
  return fetchJSON<RatingSlipDTO>(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

/**
 * Fetches a paginated list of rating slips with optional filters.
 *
 * GET /api/v1/rating-slips?table_id=X&visit_id=Y&status=Z&limit=N&cursor=C
 */
export async function listRatingSlips(
  filters: RatingSlipListFilters = {},
): Promise<{ items: RatingSlipDTO[]; cursor: string | null }> {
  const { table_id, visit_id, status, limit, cursor } = filters;
  const params = buildParams({ table_id, visit_id, status, limit, cursor });
  const url = params.toString() ? `${BASE}?${params}` : BASE;
  return fetchJSON<{ items: RatingSlipDTO[]; cursor: string | null }>(url);
}

/**
 * Fetches a single rating slip by ID with its pause history.
 *
 * GET /api/v1/rating-slips/{id}
 */
export async function getRatingSlip(
  slipId: string,
): Promise<RatingSlipWithPausesDTO> {
  return fetchJSON<RatingSlipWithPausesDTO>(`${BASE}/${slipId}`);
}

// === Rating Slip Lifecycle ===

/**
 * Pauses an open rating slip.
 * Records a new pause interval with started_at = now.
 * Fails if slip is not in 'open' status.
 *
 * POST /api/v1/rating-slips/{id}/pause
 */
export async function pauseRatingSlip(slipId: string): Promise<RatingSlipDTO> {
  return fetchJSON<RatingSlipDTO>(`${BASE}/${slipId}/pause`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify({}),
  });
}

/**
 * Resumes a paused rating slip.
 * Sets ended_at on the active pause interval.
 * Fails if slip is not in 'paused' status.
 *
 * POST /api/v1/rating-slips/{id}/resume
 */
export async function resumeRatingSlip(slipId: string): Promise<RatingSlipDTO> {
  return fetchJSON<RatingSlipDTO>(`${BASE}/${slipId}/resume`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify({}),
  });
}

/**
 * Closes a rating slip and calculates final duration.
 * Sets end_time = now and status = 'closed'.
 * Optionally updates average_bet before closing.
 * Fails if slip is already closed or archived.
 *
 * POST /api/v1/rating-slips/{id}/close
 */
export async function closeRatingSlip(
  slipId: string,
  input?: CloseRatingSlipInput,
): Promise<RatingSlipWithDurationDTO> {
  return fetchJSON<RatingSlipWithDurationDTO>(`${BASE}/${slipId}/close`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input ?? {}),
  });
}

// === Rating Slip Duration ===

/**
 * Calculates the current duration of a rating slip.
 * For open/paused slips: calculates from start_time to now.
 * For closed slips: returns the finalized duration.
 * Duration excludes all paused intervals.
 *
 * GET /api/v1/rating-slips/{id}/duration
 */
export async function getRatingSlipDuration(slipId: string): Promise<number> {
  const result = await fetchJSON<{ duration_seconds: number }>(
    `${BASE}/${slipId}/duration`,
  );
  return result.duration_seconds;
}

// === Rating Slip Average Bet ===

/**
 * Updates the average bet on an open or paused rating slip.
 * Can be called multiple times before closing.
 *
 * PATCH /api/v1/rating-slips/{id}/average-bet
 */
export async function updateAverageBet(
  slipId: string,
  input: UpdateAverageBetInput,
): Promise<RatingSlipDTO> {
  return fetchJSON<RatingSlipDTO>(`${BASE}/${slipId}/average-bet`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

// === Composite Save-with-BuyIn (PERF-005 WS7) ===

/**
 * Atomically updates average_bet and records buy-in transaction.
 * Single HTTP roundtrip replaces sequential PATCH + POST pattern.
 *
 * POST /api/v1/rating-slips/{id}/save-with-buyin
 *
 * @see PERF-005 WS7 Composite Save-with-BuyIn RPC
 */
export async function saveWithBuyIn(
  slipId: string,
  input: SaveWithBuyInInput,
): Promise<SaveWithBuyInResult> {
  return fetchJSON<SaveWithBuyInResult>(`${BASE}/${slipId}/save-with-buyin`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}

// === Pit Cash Observation (PRD-OPS-CASH-OBS-001) ===
// pit_cash_observation is owned by RatingSlipService per SRM v4.0.0

/**
 * Error class for pit cash observation operations.
 */
export class PitObservationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PitObservationError";
  }
}

/**
 * Creates a pit cash observation via RPC.
 *
 * Records what pit bosses observe when players leave tables with chips.
 * This is an operational telemetry artifact, NOT a financial settlement.
 *
 * @param input - Observation creation input
 * @returns Created observation DTO
 * @throws PitObservationError on validation or authorization failures
 *
 * @see PRD-OPS-CASH-OBS-001
 *
 * @example
 * ```ts
 * const observation = await createPitCashObservation({
 *   visitId: 'uuid',
 *   amount: 500, // $500 in dollars
 *   ratingSlipId: 'uuid',
 *   amountKind: 'estimate',
 *   source: 'walk_with',
 * });
 * ```
 */
export async function createPitCashObservation(
  input: CreatePitCashObservationInput,
): Promise<PitCashObservationDTO> {
  const supabase = createBrowserComponentClient();

  const { data, error } = await supabase.rpc(
    "rpc_create_pit_cash_observation",
    {
      p_visit_id: input.visitId,
      p_amount: input.amount,
      p_rating_slip_id: input.ratingSlipId,
      p_amount_kind: input.amountKind,
      p_source: input.source,
      p_observed_at: input.observedAt,
      p_note: input.note,
      p_idempotency_key: input.idempotencyKey,
    },
  );

  if (error) {
    // Map RPC error messages to user-friendly errors
    const message = error.message || "";

    if (message.includes("UNAUTHORIZED")) {
      throw new PitObservationError(
        "UNAUTHORIZED",
        "You are not authorized to record observations. Please log in.",
      );
    }
    if (message.includes("FORBIDDEN")) {
      throw new PitObservationError(
        "FORBIDDEN",
        "Your role is not authorized to record cash observations.",
      );
    }
    if (message.includes("NOT_FOUND")) {
      throw new PitObservationError(
        "NOT_FOUND",
        "The visit or rating slip was not found.",
      );
    }
    if (message.includes("INVALID_INPUT")) {
      throw new PitObservationError(
        "INVALID_INPUT",
        message.replace(/^INVALID_INPUT:\s*/, ""),
      );
    }

    // Default error
    throw new PitObservationError(
      "INTERNAL_ERROR",
      message || "Failed to record observation",
    );
  }

  if (!data) {
    throw new PitObservationError(
      "INTERNAL_ERROR",
      "No data returned from observation creation",
    );
  }

  // Map snake_case response to camelCase DTO
  return {
    id: data.id,
    casinoId: data.casino_id,
    gamingDay: data.gaming_day,
    playerId: data.player_id,
    visitId: data.visit_id,
    ratingSlipId: data.rating_slip_id,
    direction: data.direction,
    amount: data.amount,
    amountKind: data.amount_kind,
    source: data.source,
    observedAt: data.observed_at,
    createdByStaffId: data.created_by_staff_id,
    note: data.note,
    idempotencyKey: data.idempotency_key,
    createdAt: data.created_at,
  };
}

// === Closed Sessions (Start From Previous Panel) ===

/**
 * Fetches closed terminal rating slips for the current gaming day.
 * Gaming day is computed on the server based on casino settings.
 *
 * ISSUE-SFP-001: Uses keyset pagination with (end_time, id) cursor tuple.
 * Only returns terminal slips (excludes intermediate move slips).
 *
 * GET /api/v1/rating-slips/closed-today
 */
export async function fetchClosedSlipsForGamingDay(
  filters: {
    limit?: number;
    cursor?: ClosedSlipCursor | null;
  } = {},
): Promise<ClosedTodayResponse> {
  const params = new URLSearchParams();

  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }
  if (filters.cursor) {
    params.set("cursor_end_time", filters.cursor.endTime);
    params.set("cursor_id", filters.cursor.id);
  }

  const url = params.toString()
    ? `${BASE}/closed-today?${params}`
    : `${BASE}/closed-today`;
  return fetchJSON<ClosedTodayResponse>(url);
}
