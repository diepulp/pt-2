/**
 * Rating Slip Move Player Route
 *
 * POST /api/v1/rating-slips/[id]/move - Move player to different table/seat
 *
 * Orchestrates a move operation by:
 * 1. Validating destination table/seat is available
 * 2. Calling service.move() to handle close + start with continuity metadata
 * 3. Returning both closed and new slip IDs plus continuity data
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-016 Rating Slip Session Continuity WS5
 *
 * PRD-016: Move preserves session continuity via:
 * - visit_id (financial/loyalty continuity)
 * - move_group_id (session linking)
 * - accumulated_seconds (session totals)
 * - previous_slip_id (slip chain)
 *
 * The service layer handles all continuity metadata population.
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
import {
  createRatingSlipService,
  type MoveRatingSlipInput,
} from "@/services/rating-slip";
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
 * Returns the new slip ID for modal refresh plus continuity metadata.
 *
 * PRD-016: Includes move group and accumulated seconds for UI display.
 */
interface MovePlayerResponse {
  /** UUID of the newly created slip at the destination */
  newSlipId: string;
  /** UUID of the closed slip (original) */
  closedSlipId: string;
  /** Move group ID linking related slips */
  moveGroupId: string;
  /** Accumulated play seconds across all slips in the move chain */
  accumulatedSeconds: number;
}

/**
 * POST /api/v1/rating-slips/[id]/move
 *
 * Move a player from current table/seat to a new table/seat.
 * Requires Idempotency-Key header.
 *
 * PRD-016: Uses service.move() to preserve session continuity metadata.
 *
 * Returns:
 * - 200: Move successful, returns new and closed slip IDs plus continuity data
 * - 400: Destination seat is occupied or validation error
 * - 404: Rating slip not found
 * - 409: Rating slip is already closed or concurrent move detected
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

        // 1. Get the current slip to validate state
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

        // 3. Map API input to service input
        const moveInput: MoveRatingSlipInput = {
          new_table_id: input.destinationTableId,
          new_seat_number: input.destinationSeatNumber ?? undefined,
          game_settings: currentSlip.game_settings,
        };

        // 4. Execute move via service (handles close + start + continuity metadata)
        const moveResult = await service.move(
          casinoId,
          actorId,
          params.id,
          moveInput,
        );

        // 5. Build response with continuity metadata
        const responseData: MovePlayerResponse = {
          newSlipId: moveResult.new_slip.id,
          closedSlipId: moveResult.closed_slip.id,
          moveGroupId: moveResult.new_slip.move_group_id!,
          accumulatedSeconds: moveResult.new_slip.accumulated_seconds,
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
                : result.code === "RATING_SLIP_ALREADY_CLOSED" ||
                    result.code === "RATING_SLIP_DUPLICATE" ||
                    result.code === "CONCURRENT_MOVE_DETECTED"
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
