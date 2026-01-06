/**
 * Pit Cash Observation Service - Client Functions
 *
 * Client-side functions for recording pit cash observations (walk-with / chips taken).
 * Calls RPC directly via Supabase client.
 *
 * @see PRD-OPS-CASH-OBS-001
 * @see EXECUTION-SPEC-PRD-OPS-CASH-OBS-001.md WS3
 */

"use client";

import { createBrowserComponentClient } from "@/lib/supabase/client";

import type {
  CreatePitCashObservationInput,
  PitCashObservationDTO,
} from "./dtos";

// Re-export DTOs for convenience
export type {
  CreatePitCashObservationInput,
  PitCashObservationDTO,
} from "./dtos";

// === Error Class ===

export class PitObservationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PitObservationError";
  }
}

// === Service Function ===

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
