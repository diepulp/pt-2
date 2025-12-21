/**
 * Rating Slip Modal Data BFF Endpoint
 *
 * GET /api/v1/rating-slips/[id]/modal-data
 *
 * Aggregates data from 5 bounded contexts into a single response
 * for the rating slip modal display:
 * - RatingSlipService - Slip details
 * - VisitService - Session anchor
 * - PlayerService - Player identity
 * - LoyaltyService - Points balance and suggestion
 * - PlayerFinancialService - Financial summary
 *
 * Response Headers:
 * - X-Query-Timings: JSON object with phase timings (phaseA, phaseB, phaseC, total) in milliseconds
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3, WS5
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { createLoyaltyService } from "@/services/loyalty";
import { createPlayerService } from "@/services/player";
import { createPlayerFinancialService } from "@/services/player-financial";
import { createRatingSlipService } from "@/services/rating-slip";
import type {
  FinancialSectionDTO,
  LoyaltySectionDTO,
  PlayerSectionDTO,
  RatingSlipModalDTO,
  SlipSectionDTO,
  TableOptionDTO,
} from "@/services/rating-slip-modal/dtos";
import { modalDataRouteParamsSchema } from "@/services/rating-slip-modal/schemas";
import { createTableContextService } from "@/services/table-context";
import { createVisitService } from "@/services/visit";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * Helper function to fetch loyalty data (balance + suggestion) in parallel.
 * Suggestion evaluation can fail for various reasons, so we catch errors.
 */
async function getLoyaltyData(
  loyaltyService: ReturnType<typeof createLoyaltyService>,
  playerId: string,
  casinoId: string,
  slip: { status: string },
  slipId: string,
): Promise<{
  balance: Awaited<ReturnType<typeof loyaltyService.getBalance>> | null;
  suggestion: {
    suggestedPoints: number;
    suggestedTheo: number;
    policyVersion: string;
  } | null;
}> {
  const [balance, suggestionResult] = await Promise.all([
    loyaltyService.getBalance(playerId, casinoId),
    slip.status === "open"
      ? loyaltyService.evaluateSuggestion(slipId).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Build suggestion DTO if evaluation succeeded
  const suggestion = suggestionResult
    ? {
        suggestedPoints: suggestionResult.suggestedPoints,
        suggestedTheo: suggestionResult.suggestedTheo,
        policyVersion: suggestionResult.policyVersion,
      }
    : null;

  return { balance, suggestion };
}

/**
 * GET /api/v1/rating-slips/[id]/modal-data
 *
 * Fetch aggregated modal data for a rating slip.
 * Returns 404 if rating slip not found.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      modalDataRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Query timing instrumentation - granular per-query tracking
        const timings: Record<string, number> = {};
        const totalStart = performance.now();

        // Helper to time individual queries
        async function timed<T>(
          name: string,
          fn: () => Promise<T>,
        ): Promise<T> {
          const start = performance.now();
          const result = await fn();
          timings[name] = Math.round(performance.now() - start);
          return result;
        }

        // Create service instances
        const ratingSlipService = createRatingSlipService(mwCtx.supabase);
        const visitService = createVisitService(mwCtx.supabase);
        const playerService = createPlayerService(mwCtx.supabase);
        const loyaltyService = createLoyaltyService(mwCtx.supabase);
        const financialService = createPlayerFinancialService(mwCtx.supabase);
        const tableContextService = createTableContextService(mwCtx.supabase);

        // === PHASE A: Sequential (required dependencies) ===
        const phaseAStart = performance.now();

        // 1. Get the rating slip with pause history (required first)
        const slipWithPauses = await timed("A1_getSlip", () =>
          ratingSlipService.getById(params.id),
        );

        if (!slipWithPauses) {
          throw new DomainError(
            "RATING_SLIP_NOT_FOUND",
            "Rating slip not found",
            { httpStatus: 404, details: { slipId: params.id } },
          );
        }

        // 2. Get the visit to find player_id (requires visit_id from slip)
        const visit = await timed("A2_getVisit", () =>
          visitService.getById(slipWithPauses.visit_id),
        );

        if (!visit) {
          throw new DomainError(
            "VISIT_NOT_FOUND",
            "Associated visit not found",
          );
        }

        // Ensure we have RLS context with casino_id
        if (!mwCtx.rlsContext?.casinoId) {
          throw new DomainError("FORBIDDEN", "Casino context required", {
            httpStatus: 403,
          });
        }
        const { casinoId } = mwCtx.rlsContext;

        timings.phaseA = Math.round(performance.now() - phaseAStart);

        // === PHASE B: Parallel (independent queries) ===
        const phaseBStart = performance.now();

        const [table, durationSeconds, player, financialSummary, activeTables] =
          await Promise.all([
            timed("B1_getTable", () =>
              tableContextService.getTable(slipWithPauses.table_id, casinoId),
            ),
            timed("B2_getDuration", () =>
              ratingSlipService.getDuration(params.id),
            ),
            visit.player_id
              ? timed("B3_getPlayer", () =>
                  playerService.getById(visit.player_id!),
                )
              : Promise.resolve(null),
            timed("B4_getFinancial", () =>
              financialService.getVisitSummary(visit.id),
            ),
            timed("B5_getActiveTables", () =>
              tableContextService.getActiveTables(casinoId),
            ),
          ]);

        timings.phaseB = Math.round(performance.now() - phaseBStart);

        // === PHASE C: Parallel (player-dependent + batch seats) ===
        const phaseCStart = performance.now();

        const tableIds = activeTables.map((t) => t.id);
        const [loyaltyData, occupiedSeatsMap] = await Promise.all([
          player
            ? timed("C1_getLoyalty", () =>
                getLoyaltyData(
                  loyaltyService,
                  visit.player_id!,
                  casinoId,
                  slipWithPauses,
                  params.id,
                ),
              )
            : Promise.resolve(null),
          timed("C2_getOccupiedSeats", () =>
            ratingSlipService.getOccupiedSeatsByTables(tableIds),
          ),
        ]);

        timings.phaseC = Math.round(performance.now() - phaseCStart);

        // === Build Response DTOs ===

        // Slip section
        const slipSection: SlipSectionDTO = {
          id: slipWithPauses.id,
          visitId: slipWithPauses.visit_id,
          tableId: slipWithPauses.table_id,
          tableLabel: table.label,
          tableType: table.type,
          seatNumber: slipWithPauses.seat_number ?? null,
          averageBet: slipWithPauses.average_bet ?? 0,
          startTime: slipWithPauses.start_time,
          endTime: slipWithPauses.end_time,
          status: slipWithPauses.status,
          gamingDay: extractGamingDay(slipWithPauses.start_time),
          durationSeconds,
        };

        // Player section
        let playerSection: PlayerSectionDTO | null = null;
        if (player) {
          playerSection = {
            id: player.id,
            firstName: player.first_name,
            lastName: player.last_name,
            cardNumber: null, // Card number from enrollment, not in PlayerDTO
          };
        }

        // Loyalty section
        let loyaltySection: LoyaltySectionDTO | null = null;
        if (loyaltyData) {
          loyaltySection = {
            currentBalance: loyaltyData.balance?.currentBalance ?? 0,
            tier: loyaltyData.balance?.tier ?? "bronze",
            suggestion: loyaltyData.suggestion,
          };
        }

        // Financial section
        const financialSection: FinancialSectionDTO = {
          totalCashIn: financialSummary.total_in,
          totalChipsOut: financialSummary.total_out,
          netPosition: financialSummary.net_amount,
        };

        // Tables section (using batch query results)
        const tablesWithSeats = activeTables.map((t) => {
          const occupiedSeats = occupiedSeatsMap.get(t.id) ?? [];
          const tableOption: TableOptionDTO = {
            id: t.id,
            label: t.label,
            type: t.type,
            status: t.status,
            occupiedSeats,
          };
          return tableOption;
        });

        // Build the full modal DTO
        const modalData: RatingSlipModalDTO = {
          slip: slipSection,
          player: playerSection,
          loyalty: loyaltySection,
          financial: financialSection,
          tables: tablesWithSeats,
        };

        // Calculate total timing
        timings.total = Math.round(performance.now() - totalStart);

        return {
          ok: true as const,
          code: "OK" as const,
          data: modalData,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
          timings, // Include timings for header injection
        };
      },
      {
        domain: "rating-slip-modal",
        action: "getModalData",
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      // result is a ServiceResult, convert to HTTP response directly
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "FORBIDDEN"
            ? 403
            : result.code === "UNAUTHORIZED"
              ? 401
              : result.code === "VALIDATION_ERROR"
                ? 400
                : 500;

      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          status,
          error: result.error ?? "Unknown error",
          details: result.details,
          requestId: ctx.requestId,
          durationMs: Date.now() - ctx.startedAt,
          timestamp: new Date().toISOString(),
        },
        { status },
      );
    }

    // Extract timings if present (from extended result)
    const timings = (
      result as typeof result & { timings?: Record<string, number> }
    ).timings;

    // Build success response body
    const responseBody = {
      ok: true as const,
      code: "OK" as const,
      status: 200,
      data: result.data,
      requestId: ctx.requestId,
      durationMs: Date.now() - ctx.startedAt,
      timestamp: new Date().toISOString(),
    };

    // Build response with optional timing header
    const headers: HeadersInit = {};
    if (timings) {
      headers["X-Query-Timings"] = JSON.stringify(timings);
    }

    return NextResponse.json(responseBody, { status: 200, headers });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

/**
 * Extract gaming day from timestamp.
 * Gaming day is the date portion of the start_time in local timezone.
 * TODO: Use casino's gaming day cutoff time when available.
 */
function extractGamingDay(timestamp: string): string {
  // For now, just extract the date portion
  // In a real implementation, this would account for gaming day cutoff (e.g., 6 AM)
  return timestamp.split("T")[0];
}
