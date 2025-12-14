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
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 *
 * @see PRD-008 Rating Slip Modal Integration
 * @see EXECUTION-SPEC-PRD-008.md WS3
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
        // Create service instances
        const ratingSlipService = createRatingSlipService(mwCtx.supabase);
        const visitService = createVisitService(mwCtx.supabase);
        const playerService = createPlayerService(mwCtx.supabase);
        const loyaltyService = createLoyaltyService(mwCtx.supabase);
        const financialService = createPlayerFinancialService(mwCtx.supabase);
        const tableContextService = createTableContextService(mwCtx.supabase);

        // 1. Get the rating slip with pause history
        const slipWithPauses = await ratingSlipService.getById(params.id);

        if (!slipWithPauses) {
          throw new DomainError(
            "RATING_SLIP_NOT_FOUND",
            "Rating slip not found",
            { httpStatus: 404, details: { slipId: params.id } },
          );
        }

        // 2. Get the visit to find player_id
        const visit = await visitService.getById(slipWithPauses.visit_id);

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

        // 3. Get the table info for display
        const table = await tableContextService.getTable(
          slipWithPauses.table_id,
          casinoId,
        );

        // 4. Get duration (uses RPC that excludes paused intervals)
        const durationSeconds = await ratingSlipService.getDuration(params.id);

        // 5. Build slip section DTO
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

        // 6. Get player info (if not ghost visit)
        let playerSection: PlayerSectionDTO | null = null;
        if (visit.player_id) {
          const player = await playerService.getById(visit.player_id);
          if (player) {
            playerSection = {
              id: player.id,
              firstName: player.first_name,
              lastName: player.last_name,
              cardNumber: null, // Card number from enrollment, not in PlayerDTO
            };
          }
        }

        // 7. Get loyalty info (if player exists)
        let loyaltySection: LoyaltySectionDTO | null = null;
        if (visit.player_id) {
          const balance = await loyaltyService.getBalance(
            visit.player_id,
            casinoId,
          );

          if (balance) {
            // Only get suggestion for open slips
            let suggestion = null;
            if (slipWithPauses.status === "open") {
              try {
                const suggestionResult =
                  await loyaltyService.evaluateSuggestion(params.id);
                suggestion = {
                  suggestedPoints: suggestionResult.suggestedPoints,
                  suggestedTheo: suggestionResult.suggestedTheo,
                  policyVersion: suggestionResult.policyVersion,
                };
              } catch {
                // Suggestion evaluation can fail for various reasons
                // (no policy snapshot, etc.) - don't fail the whole request
                suggestion = null;
              }
            }

            loyaltySection = {
              currentBalance: balance.currentBalance,
              tier: balance.tier,
              suggestion,
            };
          }
        }

        // 8. Get financial summary for the visit
        const financialSummary = await financialService.getVisitSummary(
          visit.id,
        );
        const financialSection: FinancialSectionDTO = {
          totalCashIn: financialSummary.total_in,
          totalChipsOut: financialSummary.total_out,
          netPosition: financialSummary.net_amount,
        };

        // 9. Get active tables with occupied seats for move player feature
        const activeTables =
          await tableContextService.getActiveTables(casinoId);

        // For each active table, get the occupied seats
        const tablesWithSeats = await Promise.all(
          activeTables.map(async (t) => {
            const activeSlips = await ratingSlipService.getActiveForTable(t.id);
            const occupiedSeats = activeSlips
              .filter((s) => s.seat_number)
              .map((s) => s.seat_number as string);

            const tableOption: TableOptionDTO = {
              id: t.id,
              label: t.label,
              type: t.type,
              status: t.status,
              occupiedSeats,
            };
            return tableOption;
          }),
        );

        // Build the full modal DTO
        const modalData: RatingSlipModalDTO = {
          slip: slipSection,
          player: playerSection,
          loyalty: loyaltySection,
          financial: financialSection,
          tables: tablesWithSeats,
        };

        return {
          ok: true as const,
          code: "OK" as const,
          data: modalData,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
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
    return successResponse(ctx, result.data);
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
