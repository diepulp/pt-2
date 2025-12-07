/**
 * Rating Slip Duration Route
 *
 * GET /api/v1/rating-slips/[id]/duration - Get active play duration
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-002 Rating Slip Service
 *
 * Note: Returns duration in seconds, excluding paused intervals.
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createRatingSlipService } from '@/services/rating-slip';
import { ratingSlipRouteParamsSchema } from '@/services/rating-slip/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/rating-slips/[id]/duration
 *
 * Get active play duration for a rating slip.
 * Duration excludes paused intervals.
 * Returns { duration_seconds: number }
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

        const durationSeconds = await service.getDuration(params.id);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: {
            duration_seconds: durationSeconds,
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'rating-slip',
        action: 'duration',
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
