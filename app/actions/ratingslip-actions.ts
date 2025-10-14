/**
 * RatingSlip Server Actions
 * Wave 2 - Track 1: RatingSlip Action Orchestration
 *
 * Orchestrates RatingSlip session closure + Loyalty point accrual with
 * compensating transaction pattern for atomicity.
 *
 * Architecture: HYBRID (Server Action Orchestration) per BALANCED_ARCHITECTURE_QUICK.md
 */

"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCorrelationId, runWithCorrelation } from "@/lib/correlation";
import { createClient } from "@/lib/supabase/server";
import { emitTelemetry } from "@/lib/telemetry/emit-telemetry";
import { createLoyaltyBusinessService } from "@/services/loyalty/business";
import type { AccruePointsResult } from "@/services/loyalty/business";
import { createRatingSlipCrudService } from "@/services/ratingslip/crud";
import type { RatingSlipDTO } from "@/services/ratingslip/crud";
import type { ServiceResult } from "@/services/shared/types";
import type { Database } from "@/types/database.types";

// ──────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ──────────────────────────────────────────────────────────────────

/**
 * Combined result from completing a rating slip
 * Includes both session closure and loyalty accrual outcomes
 */
export interface RatingSlipCompletionResult {
  ratingSlip: RatingSlipDTO;
  loyalty: AccruePointsResult;
}

// ──────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────

/**
 * Structured logger for rating slip operations
 * Emits canonical telemetry schema for observability
 */
function logOperation(
  level: "info" | "warn" | "error",
  operation: string,
  data: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const correlationId = getCorrelationId();

  const logEntry = {
    timestamp,
    level,
    operation,
    correlation_id: correlationId,
    ...data,
  };

  if (level === "error") {
    console.error("[ratingslip-actions]", JSON.stringify(logEntry));
  } else if (level === "warn") {
    console.warn("[ratingslip-actions]", JSON.stringify(logEntry));
  } else {
    // info level - structured logging for observability
    // eslint-disable-next-line no-console
    console.log("[ratingslip-actions]", JSON.stringify(logEntry));
  }
}

// ──────────────────────────────────────────────────────────────────
// SERVER ACTIONS
// ──────────────────────────────────────────────────────────────────

/**
 * Complete a rating slip: close session + accrue loyalty points
 *
 * Orchestration Flow:
 * 1. Fetch rating slip data
 * 2. Close session via RPC (NO points parameter)
 * 3. Calculate and assign points (DIRECT SERVICE CALL, idempotent via rating_slip_id)
 * 4. Emit telemetry for observability
 *
 * Error Recovery:
 * - If loyalty accrual fails after session closed, returns PARTIAL_COMPLETION error
 * - Includes slip ID and correlation ID for recovery action
 * - UI can call recoverSlipLoyalty() to retry loyalty accrual
 *
 * Quality Gates:
 * - Returns combined result on success
 * - <500ms performance (synchronous direct service call)
 * - Idempotent (safe to replay)
 * - Correlation IDs logged for all outcomes
 *
 * @param slipId - Rating slip UUID
 * @returns ServiceResult with combined ratingSlip + loyalty data
 *
 * @example
 * ```typescript
 * const result = await completeRatingSlip('123e4567-e89b-12d3-a456-426614174000');
 * if (result.success) {
 *   console.log(`Earned ${result.data.loyalty.pointsEarned} points`);
 *   console.log(`New tier: ${result.data.loyalty.tier}`);
 * } else if (result.error?.code === 'PARTIAL_COMPLETION') {
 *   // Session closed but loyalty pending - use recovery action
 *   await recoverSlipLoyalty(slipId, result.error.metadata.correlationId);
 * }
 * ```
 */
export async function completeRatingSlip(
  slipId: string,
): Promise<ServiceResult<RatingSlipCompletionResult>> {
  return runWithCorrelation(undefined, async () => {
    const correlationId = getCorrelationId();
    const supabase = await createClient();
    const ratingSlipService = createRatingSlipCrudService(supabase);
    const loyaltyService = createLoyaltyBusinessService(supabase);

    logOperation("info", "complete_rating_slip_started", {
      slip_id: slipId,
    });

    try {
      // 1. Fetch rating slip data (need full row for game_settings)
      const { data: slip, error: slipError } = await supabase
        .from("ratingslip")
        .select("*")
        .eq("id", slipId)
        .single();

      if (slipError || !slip) {
        logOperation("error", "complete_rating_slip_failed", {
          slip_id: slipId,
          reason: "slip_not_found",
        });
        return {
          success: false,
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Rating slip not found",
          },
          status: 404,
          timestamp: new Date().toISOString(),
          requestId: correlationId ?? "unknown",
        };
      }

      // Validate slip is not already closed
      if (slip.status === "CLOSED") {
        logOperation("warn", "complete_rating_slip_idempotent", {
          slip_id: slipId,
          reason: "already_closed",
        });
        return {
          success: false,
          data: null,
          error: {
            code: "INVALID_STATE",
            message: "Rating slip is already closed",
          },
          status: 400,
          timestamp: new Date().toISOString(),
          requestId: correlationId ?? "unknown",
        };
      }

      // Validate required fields
      if (!slip.visit_id) {
        logOperation("error", "complete_rating_slip_failed", {
          slip_id: slipId,
          reason: "missing_visit_id",
        });
        return {
          success: false,
          data: null,
          error: {
            code: "INVALID_STATE",
            message: "Rating slip missing visit_id",
          },
          status: 400,
          timestamp: new Date().toISOString(),
          requestId: correlationId ?? "unknown",
        };
      }

      // 2. Close session via RPC (NO points parameter - loyalty handled separately)
      const { error: rpcError } = await supabase.rpc("close_player_session", {
        p_rating_slip_id: slipId,
        p_visit_id: slip.visit_id,
        p_chips_taken: 0, // TEMPORARY: Add chips_taken to RatingSlipDTO in future iteration
        p_end_time: new Date().toISOString(),
      });

      if (rpcError) {
        logOperation("error", "complete_rating_slip_failed", {
          slip_id: slipId,
          reason: "rpc_close_session_failed",
          error: rpcError.message,
        });
        throw rpcError;
      }

      // 3. Convert game_settings from Json to GameSettings
      const gameSettings = slip.game_settings as unknown as {
        house_edge: number;
        average_rounds_per_hour: number;
        point_multiplier: number | null;
        points_conversion_rate: number | null;
        seats_available: number | null;
        name?: string;
      };

      // 4. Calculate and assign points (DIRECT SERVICE CALL, idempotent via rating_slip_id)
      const loyaltyResult = await loyaltyService.accruePointsFromSlip({
        playerId: slip.playerId,
        ratingSlipId: slipId,
        visitId: slip.visit_id,
        averageBet: slip.average_bet,
        durationSeconds: slip.accumulated_seconds,
        gameSettings,
      });

      if (!loyaltyResult.success || !loyaltyResult.data) {
        // Loyalty accrual failed AFTER session closed - return PARTIAL_COMPLETION
        logOperation("error", "complete_rating_slip_partial", {
          slip_id: slipId,
          correlation_id: correlationId,
          reason: "loyalty_accrual_failed",
          error: loyaltyResult.error?.message,
          recovery_needed: true,
        });

        return {
          success: false,
          data: null,
          error: {
            code: "PARTIAL_COMPLETION",
            message:
              "Slip closed but loyalty pending. Use recovery action to retry.",
            metadata: {
              slipId,
              correlationId: correlationId ?? "unknown",
            },
          },
          status: 207, // Multi-Status (partial success)
          timestamp: new Date().toISOString(),
          requestId: correlationId ?? "unknown",
        };
      }

      // 5. Emit telemetry for observability
      emitTelemetry({
        eventType: "RATING_SLIP_COMPLETED",
        timestamp: new Date().toISOString(),
        correlationId: correlationId ?? null,
        playerId: slip.playerId,
        metadata: {
          sessionId: slipId,
          pointsEarned: loyaltyResult.data.pointsEarned,
          tier: loyaltyResult.data.tier,
          averageBet: slip.average_bet,
          durationSeconds: slip.accumulated_seconds,
        },
      });

      logOperation("info", "complete_rating_slip_success", {
        slip_id: slipId,
        points_earned: loyaltyResult.data.pointsEarned,
        new_tier: loyaltyResult.data.tier,
      });

      // 6. Create RatingSlipDTO from full row
      const ratingSlipDTO: RatingSlipDTO = {
        id: slip.id,
        playerId: slip.playerId,
        visit_id: slip.visit_id,
        gaming_table_id: slip.gaming_table_id,
        average_bet: slip.average_bet,
        status: slip.status,
        start_time: slip.start_time,
        end_time: slip.end_time,
        seat_number: slip.seat_number,
        accumulated_seconds: slip.accumulated_seconds,
      };

      return {
        success: true,
        data: {
          ratingSlip: ratingSlipDTO,
          loyalty: loyaltyResult.data,
        },
        error: null,
        status: 200,
        timestamp: new Date().toISOString(),
        requestId: correlationId ?? "unknown",
      };
    } catch (error) {
      // Catch-all for unexpected errors
      logOperation("error", "complete_rating_slip_failed", {
        slip_id: slipId,
        correlation_id: correlationId,
        error: error instanceof Error ? error.message : String(error),
        recovery_needed: true,
      });

      return {
        success: false,
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
          metadata: { slipId, correlationId: correlationId ?? "unknown" },
        },
        status: 500,
        timestamp: new Date().toISOString(),
        requestId: correlationId ?? "unknown",
      };
    }
  });
}

/**
 * Recover loyalty accrual after partial completion
 *
 * Use this action when completeRatingSlip() returns PARTIAL_COMPLETION error.
 * This typically happens when:
 * - Session closed successfully via RPC
 * - Loyalty accrual failed due to transient error (network, database timeout)
 * - Need to retry loyalty accrual without re-closing session
 *
 * Safety Guarantees:
 * - Idempotent (safe to call multiple times)
 * - Checks if loyalty already accrued (returns existing entry)
 * - Validates slip is CLOSED before attempting recovery
 * - Uses deterministic idempotency key (rating_slip_id)
 *
 * @param slipId - Rating slip UUID
 * @param correlationId - Original correlation ID from partial completion
 * @returns ServiceResult with loyalty accrual outcome
 *
 * @example
 * ```typescript
 * const completion = await completeRatingSlip(slipId);
 * if (completion.error?.code === 'PARTIAL_COMPLETION') {
 *   const recovery = await recoverSlipLoyalty(
 *     completion.error.metadata.slipId,
 *     completion.error.metadata.correlationId
 *   );
 *   if (recovery.success) {
 *     console.log('Recovery successful:', recovery.data);
 *   }
 * }
 * ```
 */
export async function recoverSlipLoyalty(
  slipId: string,
  correlationId: string,
): Promise<ServiceResult<AccruePointsResult>> {
  return runWithCorrelation(correlationId, async () => {
    const supabase = await createClient();
    const loyaltyService = createLoyaltyBusinessService(supabase);

    logOperation("info", "recover_slip_loyalty_started", {
      slip_id: slipId,
      correlation_id: correlationId,
    });

    try {
      // 1. Check if loyalty already accrued
      const { data: existingEntry, error: queryError } = await supabase
        .from("loyalty_ledger")
        .select("*")
        .eq("rating_slip_id", slipId)
        .eq("transaction_type", "GAMEPLAY")
        .maybeSingle();

      if (queryError) {
        logOperation("error", "recover_slip_loyalty_failed", {
          slip_id: slipId,
          reason: "query_failed",
          error: queryError.message,
        });
        throw queryError;
      }

      if (existingEntry) {
        // Already recovered (idempotent success)
        logOperation("info", "recover_slip_loyalty_idempotent", {
          slip_id: slipId,
          ledger_entry_id: existingEntry.id,
          points_change: existingEntry.points_change,
        });

        return {
          success: true,
          data: {
            pointsEarned: existingEntry.points_change,
            newBalance: existingEntry.balance_after ?? 0,
            tier: existingEntry.tier_after ?? "BRONZE",
            ledgerEntry: existingEntry,
          },
          error: null,
          status: 200,
          timestamp: new Date().toISOString(),
          requestId: correlationId,
        };
      }

      // 2. Verify slip is CLOSED
      const { data: slip, error: slipError } = await supabase
        .from("ratingslip")
        .select("*")
        .eq("id", slipId)
        .single();

      if (slipError || !slip) {
        logOperation("error", "recover_slip_loyalty_failed", {
          slip_id: slipId,
          reason: "slip_not_found",
        });
        return {
          success: false,
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Rating slip not found",
          },
          status: 404,
          timestamp: new Date().toISOString(),
          requestId: correlationId,
        };
      }

      if (slip.status !== "CLOSED") {
        logOperation("error", "recover_slip_loyalty_failed", {
          slip_id: slipId,
          reason: "slip_not_closed",
          current_status: slip.status,
        });
        return {
          success: false,
          data: null,
          error: {
            code: "INVALID_STATE",
            message: "Cannot recover loyalty for open slip",
          },
          status: 400,
          timestamp: new Date().toISOString(),
          requestId: correlationId,
        };
      }

      // 3. Convert game_settings from Json to GameSettings
      const gameSettings = slip.game_settings as unknown as {
        house_edge: number;
        average_rounds_per_hour: number;
        point_multiplier: number | null;
        points_conversion_rate: number | null;
        seats_available: number | null;
        name?: string;
      };

      // 4. Accrue points using deterministic key (rating_slip_id)
      const loyaltyResult = await loyaltyService.accruePointsFromSlip({
        ratingSlipId: slipId,
        playerId: slip.playerId,
        visitId: slip.visit_id,
        averageBet: slip.average_bet,
        durationSeconds: slip.accumulated_seconds,
        gameSettings,
      });

      if (loyaltyResult.success) {
        logOperation("info", "recover_slip_loyalty_success", {
          slip_id: slipId,
          points_earned: loyaltyResult.data?.pointsEarned,
          new_tier: loyaltyResult.data?.tier,
        });

        // Emit telemetry for recovered loyalty
        emitTelemetry({
          eventType: "RATING_SLIP_COMPLETED",
          timestamp: new Date().toISOString(),
          correlationId,
          playerId: slip.playerId,
          metadata: {
            sessionId: slipId,
            pointsEarned: loyaltyResult.data?.pointsEarned,
            tier: loyaltyResult.data?.tier,
            recovered: true,
          },
        });
      } else {
        logOperation("error", "recover_slip_loyalty_failed", {
          slip_id: slipId,
          reason: "loyalty_accrual_failed",
          error: loyaltyResult.error?.message,
        });
      }

      return loyaltyResult;
    } catch (error) {
      logOperation("error", "recover_slip_loyalty_failed", {
        slip_id: slipId,
        correlation_id: correlationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
        status: 500,
        timestamp: new Date().toISOString(),
        requestId: correlationId,
      };
    }
  });
}
