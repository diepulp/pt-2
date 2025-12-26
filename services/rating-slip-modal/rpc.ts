/**
 * RatingSlipModal BFF RPC Service
 *
 * Server-side RPC wrapper for the rpc_get_rating_slip_modal_data PostgreSQL function.
 * Provides type-safe interface to the BFF RPC that reduces modal-data endpoint
 * latency from ~600ms to ~150ms.
 *
 * @see PRD-018 Rating Slip Modal BFF RPC Implementation
 * @see docs/20-architecture/specs/PERF-001/BFF-RPC-DESIGN.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/errors/domain-errors";
import type { Database } from "@/types/database.types";

import type { RatingSlipModalDTO } from "./dtos";

/**
 * Raw RPC response shape from PostgreSQL.
 * Maps to RatingSlipModalDTO structure but with raw JSON types.
 */
interface RpcModalDataResponse {
  slip: {
    id: string;
    visitId: string;
    tableId: string;
    tableLabel: string;
    tableType: string;
    seatNumber: string | null;
    averageBet: number;
    startTime: string;
    endTime: string | null;
    status: string;
    gamingDay: string;
    durationSeconds: number;
  };
  player: {
    id: string;
    firstName: string;
    lastName: string;
    cardNumber: string | null;
  } | null;
  loyalty: {
    currentBalance: number;
    tier: string | null;
    suggestion: {
      suggestedPoints: number;
      suggestedTheo: number;
      policyVersion: string;
    } | null;
  } | null;
  financial: {
    totalCashIn: number;
    totalChipsOut: number;
    netPosition: number;
  };
  tables: Array<{
    id: string;
    label: string;
    type: string;
    status: string;
    occupiedSeats: string[];
  }>;
}

/**
 * Type guard for RPC response validation.
 * Validates the shape of the JSONB response from the PostgreSQL RPC.
 */
function isValidRpcModalDataResponse(
  data: unknown,
): data is RpcModalDataResponse {
  if (!data || typeof data !== "object") return false;

  const obj = data as Record<string, unknown>;

  // Validate slip section (required)
  if (!obj.slip || typeof obj.slip !== "object") return false;
  const slip = obj.slip as Record<string, unknown>;
  if (typeof slip.id !== "string") return false;
  if (typeof slip.visitId !== "string") return false;
  if (typeof slip.tableId !== "string") return false;
  if (typeof slip.tableLabel !== "string") return false;
  if (typeof slip.tableType !== "string") return false;
  if (typeof slip.status !== "string") return false;

  // Validate financial section (required)
  if (!obj.financial || typeof obj.financial !== "object") return false;
  const financial = obj.financial as Record<string, unknown>;
  if (typeof financial.totalCashIn !== "number") return false;
  if (typeof financial.totalChipsOut !== "number") return false;
  if (typeof financial.netPosition !== "number") return false;

  // Validate tables section (required, array)
  if (!Array.isArray(obj.tables)) return false;

  // player and loyalty are nullable, so we just check they're objects if present
  if (obj.player !== null && typeof obj.player !== "object") return false;
  if (obj.loyalty !== null && typeof obj.loyalty !== "object") return false;

  return true;
}

/**
 * Fetches rating slip modal data via the BFF RPC function.
 *
 * This function consolidates 6+ database queries into a single round trip,
 * reducing endpoint latency by ~75%.
 *
 * Security:
 * - Uses SECURITY INVOKER (inherits caller's RLS context)
 * - Explicit casino_id validation (defense-in-depth)
 * - Cross-casino queries throw explicit error (not silent filter)
 *
 * @param supabase - Authenticated Supabase client with RLS context
 * @param slipId - Rating slip UUID
 * @param casinoId - Casino UUID (must match RLS context)
 * @returns RatingSlipModalDTO - Complete modal data
 * @throws DomainError with specific codes:
 *   - RATING_SLIP_NOT_FOUND (404)
 *   - VISIT_NOT_FOUND (404)
 *   - TABLE_NOT_FOUND (404)
 *   - CASINO_MISMATCH (403)
 *   - UNAUTHORIZED (401)
 *
 * @example
 * ```ts
 * const modalData = await getModalDataViaRPC(supabase, slipId, casinoId);
 * // Single round trip, ~150ms vs ~600ms multi-query
 * ```
 */
export async function getModalDataViaRPC(
  supabase: SupabaseClient<Database>,
  slipId: string,
  casinoId: string,
): Promise<RatingSlipModalDTO> {
  const { data, error } = await supabase.rpc("rpc_get_rating_slip_modal_data", {
    p_slip_id: slipId,
    p_casino_id: casinoId,
  });

  if (error) {
    // Parse PostgreSQL error message for domain-specific errors
    const message = error.message ?? "";

    if (message.includes("RATING_SLIP_NOT_FOUND")) {
      throw new DomainError("RATING_SLIP_NOT_FOUND", "Rating slip not found", {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes("VISIT_NOT_FOUND")) {
      throw new DomainError("VISIT_NOT_FOUND", "Associated visit not found", {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes("TABLE_NOT_FOUND")) {
      throw new DomainError("TABLE_NOT_FOUND", "Gaming table not found", {
        httpStatus: 404,
        details: { slipId },
      });
    }

    if (message.includes("CASINO_MISMATCH")) {
      throw new DomainError(
        "FORBIDDEN",
        "Casino context mismatch - access denied",
        { httpStatus: 403, details: { slipId, casinoId } },
      );
    }

    if (message.includes("UNAUTHORIZED")) {
      throw new DomainError("UNAUTHORIZED", "RLS context not set", {
        httpStatus: 401,
      });
    }

    // Generic database error
    throw new DomainError(
      "INTERNAL_ERROR",
      `RPC call failed: ${error.message}`,
      { httpStatus: 500, details: { code: error.code, hint: error.hint } },
    );
  }

  if (!data) {
    throw new DomainError(
      "RATING_SLIP_NOT_FOUND",
      "No data returned from RPC",
      {
        httpStatus: 404,
        details: { slipId },
      },
    );
  }

  // Validate RPC response shape using type guard
  if (!isValidRpcModalDataResponse(data)) {
    throw new DomainError("INTERNAL_ERROR", "Invalid RPC response structure", {
      httpStatus: 500,
      details: { slipId, received: typeof data },
    });
  }

  // Map to RatingSlipModalDTO with proper type casting
  // Type assertions below are safe because we validated with type guard above
  const modalData: RatingSlipModalDTO = {
    slip: {
      id: data.slip.id,
      visitId: data.slip.visitId,
      tableId: data.slip.tableId,
      tableLabel: data.slip.tableLabel,
      tableType: data.slip.tableType as RatingSlipModalDTO["slip"]["tableType"],
      seatNumber: data.slip.seatNumber,
      averageBet: data.slip.averageBet,
      startTime: data.slip.startTime,
      endTime: data.slip.endTime,
      status: data.slip.status as RatingSlipModalDTO["slip"]["status"],
      gamingDay: data.slip.gamingDay,
      durationSeconds: data.slip.durationSeconds,
    },
    player: data.player
      ? {
          id: data.player.id,
          firstName: data.player.firstName,
          lastName: data.player.lastName,
          cardNumber: data.player.cardNumber,
        }
      : null,
    loyalty: data.loyalty
      ? {
          currentBalance: data.loyalty.currentBalance,
          tier: data.loyalty.tier,
          suggestion: data.loyalty.suggestion
            ? {
                suggestedPoints: data.loyalty.suggestion.suggestedPoints,
                suggestedTheo: data.loyalty.suggestion.suggestedTheo,
                policyVersion: data.loyalty.suggestion.policyVersion,
              }
            : null,
        }
      : null,
    financial: {
      totalCashIn: data.financial.totalCashIn,
      totalChipsOut: data.financial.totalChipsOut,
      netPosition: data.financial.netPosition,
    },
    tables: data.tables.map((t) => ({
      id: t.id,
      label: t.label,
      type: t.type as RatingSlipModalDTO["tables"][0]["type"],
      status: t.status as RatingSlipModalDTO["tables"][0]["status"],
      occupiedSeats: t.occupiedSeats,
    })),
  };

  return modalData;
}
