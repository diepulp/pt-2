/**
 * Rating Slip Average Bet Route
 *
 * PATCH /api/v1/rating-slips/[id]/average-bet - Update average bet on open/paused slip
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-002 Rating Slip Service
 *
 * Note: Requires slip to be in "open" or "paused" state.
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseParams,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { createRatingSlipService } from "@/services/rating-slip";
import {
  ratingSlipRouteParamsSchema,
  updateAverageBetSchema,
} from "@/services/rating-slip/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/rating-slips/[id]/average-bet
 *
 * Update average bet on an open or paused rating slip.
 * Requires Idempotency-Key header.
 * Returns 409 if slip is closed.
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      ratingSlipRouteParamsSchema,
    );

    const body = await request.json();
    const input = updateAverageBetSchema.parse(body);

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRatingSlipService(mwCtx.supabase);

        const slip = await service.updateAverageBet(
          params.id,
          input.average_bet,
        );

        return {
          ok: true as const,
          code: "OK" as const,
          data: slip,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "rating-slip",
        action: "update-average-bet",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
