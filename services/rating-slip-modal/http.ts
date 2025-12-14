/**
 * RatingSlipModal HTTP Fetchers
 *
 * Client-side fetch functions for rating slip modal BFF endpoint.
 * Used by TanStack Query hooks.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3
 */

import { fetchJSON } from "@/lib/http/fetch-json";

import type {
  MovePlayerInput,
  MovePlayerResponse,
  RatingSlipModalDTO,
} from "./dtos";

// Re-export types for convenience
export type { MovePlayerInput, MovePlayerResponse };

// === Fetcher Functions ===

/**
 * Fetches aggregated modal data for a rating slip.
 *
 * Aggregates data from 5 bounded contexts:
 * - RatingSlipService - Slip details
 * - VisitService - Session anchor
 * - PlayerService - Player identity
 * - LoyaltyService - Points balance
 * - PlayerFinancialService - Financial summary
 *
 * @param slipId - Rating slip UUID
 * @returns Aggregated modal data
 * @throws FetchError if fetch fails or response is not ok
 *
 * @example
 * ```ts
 * const modalData = await fetchRatingSlipModalData(slipId);
 * // Access slip details: modalData.slip.averageBet
 * // Access loyalty balance: modalData.loyalty?.currentBalance
 * ```
 */
export async function fetchRatingSlipModalData(
  slipId: string,
): Promise<RatingSlipModalDTO> {
  return fetchJSON<RatingSlipModalDTO>(
    `/api/v1/rating-slips/${slipId}/modal-data`,
    {
      method: "GET",
    },
  );
}

/**
 * Moves a player from current table/seat to a new table/seat.
 *
 * Orchestrates:
 * 1. Validates destination seat availability
 * 2. Closes current rating slip
 * 3. Starts new rating slip at destination with same visit_id
 *
 * @param slipId - Current rating slip UUID
 * @param input - Move player input (destination table/seat, optional average bet)
 * @returns Move player response with new slip ID
 * @throws FetchError if fetch fails, destination occupied, or slip already closed
 *
 * @example
 * ```ts
 * const result = await movePlayer(currentSlipId, {
 *   destinationTableId: 'table-uuid',
 *   destinationSeatNumber: '3',
 *   averageBet: 25,
 * });
 * // Use result.newSlipId for modal refresh
 * // Use result.closedSlipId to track the closed slip
 * ```
 */
export async function movePlayer(
  slipId: string,
  input: MovePlayerInput,
): Promise<MovePlayerResponse> {
  const idempotencyKey = `move-player-${slipId}-${input.destinationTableId}-${input.destinationSeatNumber ?? "unseated"}-${Date.now()}`;

  return fetchJSON<MovePlayerResponse>(`/api/v1/rating-slips/${slipId}/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}
