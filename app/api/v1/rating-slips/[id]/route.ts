/**
 * Rating Slip Detail Route
 *
 * GET /api/v1/rating-slips/[id] - Get rating slip by ID with pause history
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-002 Rating Slip Service
 */

import type { NextRequest } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { createRatingSlipService } from "@/services/rating-slip";
import { ratingSlipRouteParamsSchema } from "@/services/rating-slip/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/rating-slips/[id]
 *
 * Get rating slip details by ID with pause history.
 * Returns 404 if rating slip not found.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      ratingSlipRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRatingSlipService(mwCtx.supabase);

        const slip = await service.getById(params.id);

        if (!slip) {
          throw new DomainError(
            "RATING_SLIP_NOT_FOUND",
            "Rating slip not found",
            {
              httpStatus: 404,
              details: { slipId: params.id },
            },
          );
        }

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
        action: "detail",
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
