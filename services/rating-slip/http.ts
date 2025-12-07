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

import { fetchJSON } from '@/lib/http/fetch-json';

import type {
  CloseRatingSlipInput,
  CreateRatingSlipInput,
  RatingSlipDTO,
  RatingSlipListFilters,
  RatingSlipWithDurationDTO,
  RatingSlipWithPausesDTO,
  UpdateAverageBetInput,
} from './dtos';

const BASE = '/api/v1/rating-slips';

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
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': generateIdempotencyKey(),
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
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': generateIdempotencyKey(),
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
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': generateIdempotencyKey(),
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
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': generateIdempotencyKey(),
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
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': generateIdempotencyKey(),
    },
    body: JSON.stringify(input),
  });
}
