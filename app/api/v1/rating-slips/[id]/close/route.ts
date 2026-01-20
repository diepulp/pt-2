/**
 * Rating Slip Close Route
 *
 * POST /api/v1/rating-slips/[id]/close - Close rating slip (terminal state)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-002 Rating Slip Service
 *
 * Note: Closing is a terminal state transition. Returns duration_seconds.
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { CloseRatingSlipInput } from '@/services/rating-slip';
import { createRatingSlipService } from '@/services/rating-slip';
import {
  closeRatingSlipSchema,
  ratingSlipRouteParamsSchema,
} from '@/services/rating-slip/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/rating-slips/[id]/close
 *
 * Close a rating slip (terminal state).
 * Requires Idempotency-Key header.
 * Returns slip with duration_seconds (active play time excluding pauses).
 * Returns 409 if slip is already closed.
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

    // Body is optional for close (average_bet can be set)
    let input: CloseRatingSlipInput = {};
    try {
      const body = await readJsonBody<CloseRatingSlipInput>(request);
      input = closeRatingSlipSchema.parse(body);
    } catch {
      // Empty body is valid
    }

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRatingSlipService(mwCtx.supabase);

        // ADR-024: actor_id now derived internally via set_rls_context_from_staff()
        const slipWithDuration = await service.close(
          mwCtx.rlsContext!.casinoId,
          params.id,
          input,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: slipWithDuration,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'rating-slip',
        action: 'close',
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
