/**
 * Loyalty Accrual Route
 *
 * POST /api/v1/loyalty/accrue - Trigger base accrual on rating slip close
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-004 Loyalty Service
 * Idempotency: Required header - dedupes via ledger hash
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createLoyaltyService } from '@/services/loyalty';
import { accrueOnCloseInputSchema } from '@/services/loyalty/schemas';

/**
 * POST /api/v1/loyalty/accrue
 *
 * Triggers base accrual on rating slip close.
 * Uses deterministic theo calculation from policy_snapshot.loyalty.
 * Requires Idempotency-Key header.
 * Returns 201 for new accrual, 200 for replay.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    // Validate input
    const input = accrueOnCloseInputSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createLoyaltyService(mwCtx.supabase);

        const data = await service.accrueOnClose(input);

        return {
          ok: true as const,
          code: 'OK' as const,
          data,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'accrue',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 for new accrual, 200 for replay (idempotent)
    const status = result.data?.isExisting ? 200 : 201;
    return successResponse(ctx, result.data, 'OK', status);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
