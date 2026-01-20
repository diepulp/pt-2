/**
 * Rating Slip Resume Route
 *
 * POST /api/v1/rating-slips/[id]/resume - Resume a paused rating slip
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-002 Rating Slip Service
 *
 * Note: Requires slip to be in "paused" state.
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createRatingSlipService } from '@/services/rating-slip';
import { ratingSlipRouteParamsSchema } from '@/services/rating-slip/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/rating-slips/[id]/resume
 *
 * Resume a paused rating slip (player returning from break).
 * Requires Idempotency-Key header.
 * Returns 409 if slip is not in paused state.
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      ratingSlipRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRatingSlipService(mwCtx.supabase);

        // ADR-024: actor_id now derived internally via set_rls_context_from_staff()
        const slip = await service.resume(
          mwCtx.rlsContext!.casinoId,
          params.id,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: slip,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'rating-slip',
        action: 'resume',
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
