/**
 * Visit Live View Route
 *
 * GET /api/v1/visits/[visitId]/live-view - Get session aggregates for a visit
 *
 * PRD-016: Provides operators with stable "session slip" view across all rating slips.
 * Uses rpc_get_visit_live_view RPC for aggregation.
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createRatingSlipService } from '@/services/rating-slip';
import {
  visitLiveViewQuerySchema,
  visitRouteParamsSchema,
} from '@/services/visit/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ visitId: string }> };

/**
 * GET /api/v1/visits/[visitId]/live-view
 *
 * Get visit live view with session aggregates.
 *
 * Query params:
 * - include_segments: boolean (default false) - Include slip segments array
 * - segments_limit: int (default 10, max 50) - Max segments to return
 *
 * Returns:
 * - 200: VisitLiveViewDTO with session aggregates
 * - 404: Visit not found
 * - 403: Forbidden (RLS blocked)
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      visitRouteParamsSchema,
    );

    // Parse query params
    const url = new URL(request.url);
    const queryParams = visitLiveViewQuerySchema.parse({
      include_segments: url.searchParams.get('include_segments') ?? undefined,
      segments_limit: url.searchParams.get('segments_limit') ?? undefined,
    });

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Note: Using RatingSlipService for getVisitLiveView
        // as it's cross-context but visit is the anchor
        const service = createRatingSlipService(mwCtx.supabase);
        const casinoId = mwCtx.rlsContext!.casinoId;

        const liveView = await service.getVisitLiveView(
          casinoId,
          params.visitId,
          {
            includeSegments: queryParams.include_segments,
            segmentsLimit: queryParams.segments_limit,
          },
        );

        if (!liveView) {
          throw new DomainError('VISIT_NOT_FOUND', 'Visit not found', {
            httpStatus: 404,
            details: { visitId: params.visitId },
          });
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: liveView,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'visit',
        action: 'liveView',
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
