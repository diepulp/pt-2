/**
 * Rating Slip Move Player Route
 *
 * POST /api/v1/rating-slips/[id]/move - Move player to different table/seat
 *
 * PRD-020: Uses consolidated rpc_move_player RPC for single-transaction move.
 * Reduces 4 DB round-trips to 1, latency from ~700ms to ~150ms.
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-020 Move Player Performance & UX Remediation
 *
 * Move preserves session continuity via:
 * - visit_id (financial/loyalty continuity)
 * - move_group_id (session linking)
 * - accumulated_seconds (session totals)
 * - previous_slip_id (slip chain)
 *
 * Enhanced response includes seat state arrays for cache optimization.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
import { ratingSlipRouteParamsSchema } from "@/services/rating-slip/schemas";
import type { MovePlayerResponse } from "@/services/rating-slip-modal/dtos";
import { movePlayerViaRPC } from "@/services/rating-slip-modal/rpc";
import {
  movePlayerSchema,
  type MovePlayerInput,
} from "@/services/rating-slip-modal/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/rating-slips/[id]/move
 *
 * Move a player from current table/seat to a new table/seat.
 * Requires Idempotency-Key header.
 *
 * PRD-020: Uses consolidated RPC for single-transaction move with enhanced response.
 *
 * Returns:
 * - 200: Move successful with enhanced response including seat state arrays
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
        const casinoId = mwCtx.rlsContext!.casinoId;

        // PRD-020: Use consolidated RPC for single-transaction move
        // All validation (slip state, seat availability) happens atomically in RPC
        const responseData: MovePlayerResponse = await movePlayerViaRPC(
          mwCtx.supabase,
          casinoId,
          params.id,
          input,
        );

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
                  result.code === "SEAT_OCCUPIED"
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
