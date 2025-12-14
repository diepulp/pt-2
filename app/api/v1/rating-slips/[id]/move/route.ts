/**
 * Rating Slip Move Player Route
 *
 * POST /api/v1/rating-slips/[id]/move - Move player to different table/seat
 *
 * Orchestrates a move operation by:
 * 1. Validating destination table/seat is available
 * 2. Closing the current rating slip
 * 3. Starting a new rating slip at the destination with the SAME visit_id
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-008 Rating Slip Modal Integration WS5
 *
 * Note: Move preserves visit continuity - the new slip maintains the same visit_id
 * so financial transactions and loyalty points remain associated with the session.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { createRatingSlipService } from "@/services/rating-slip";
import { ratingSlipRouteParamsSchema } from "@/services/rating-slip/schemas";
import {
  movePlayerSchema,
  type MovePlayerInput,
} from "@/services/rating-slip-modal/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

// === Move Player Response DTO ===

/**
 * Response type for move operation.
 * Returns the new slip ID for modal refresh.
 */
interface MovePlayerResponse {
  /** UUID of the newly created slip at the destination */
  newSlipId: string;
  /** UUID of the closed slip (original) */
  closedSlipId: string;
}

/**
 * POST /api/v1/rating-slips/[id]/move
 *
 * Move a player from current table/seat to a new table/seat.
 * Requires Idempotency-Key header.
 *
 * Returns:
 * - 200: Move successful, returns new slip ID
 * - 400: Destination seat is occupied
 * - 404: Rating slip not found
 * - 409: Rating slip is already closed
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      ratingSlipRouteParamsSchema,
    );
    const input = movePlayerSchema.parse(
      await readJsonBody<MovePlayerInput>(request),
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRatingSlipService(mwCtx.supabase);
        const casinoId = mwCtx.rlsContext!.casinoId;
        const actorId = mwCtx.rlsContext!.actorId;

        // 1. Get the current slip to extract visit_id and validate state
        const currentSlip = await service.getById(params.id);

        if (!currentSlip) {
          throw new DomainError(
            "RATING_SLIP_NOT_FOUND",
            "Rating slip not found",
            { httpStatus: 404, details: { slipId: params.id } },
          );
        }

        // Cannot move a closed slip
        if (currentSlip.status === "closed") {
          throw new DomainError(
            "RATING_SLIP_ALREADY_CLOSED",
            "Cannot move a closed rating slip",
            { httpStatus: 409 },
          );
        }

        // 2. Validate destination seat is not occupied (if seat specified)
        if (input.destinationSeatNumber) {
          const activeSlipsAtDestination = await service.getActiveForTable(
            input.destinationTableId,
          );

          const seatOccupied = activeSlipsAtDestination.some(
            (slip) => slip.seat_number === input.destinationSeatNumber,
          );

          if (seatOccupied) {
            throw new DomainError(
              "SEAT_ALREADY_OCCUPIED",
              `Seat ${input.destinationSeatNumber} is already occupied at the destination table`,
              { httpStatus: 400 },
            );
          }
        }

        // 3. Close the current slip with optional average_bet
        const closedSlip = await service.close(casinoId, actorId, params.id, {
          average_bet: input.averageBet,
        });

        // 4. Start new slip at destination with SAME visit_id
        const newSlip = await service.start(casinoId, actorId, {
          visit_id: currentSlip.visit_id,
          table_id: input.destinationTableId,
          seat_number: input.destinationSeatNumber ?? undefined,
          // Preserve game settings if they exist
          game_settings: currentSlip.game_settings,
        });

        const responseData: MovePlayerResponse = {
          newSlipId: newSlip.id,
          closedSlipId: closedSlip.id,
        };

        return {
          ok: true as const,
          code: "OK" as const,
          data: responseData,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "rating-slip",
        action: "movePlayer",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      // result is a ServiceResult, convert to HTTP response directly
      const status =
        result.code === "NOT_FOUND" || result.code === "RATING_SLIP_NOT_FOUND"
          ? 404
          : result.code === "FORBIDDEN"
            ? 403
            : result.code === "UNAUTHORIZED"
              ? 401
              : result.code === "VALIDATION_ERROR" ||
                  result.code === "SEAT_ALREADY_OCCUPIED"
                ? 400
                : result.code === "RATING_SLIP_ALREADY_CLOSED"
                  ? 409
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
