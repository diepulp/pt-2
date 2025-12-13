/**
 * Loyalty Redemption Route
 *
 * POST /api/v1/loyalty/redeem - Issue comp redemption (debit)
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
import { redeemInputSchema } from '@/services/loyalty/schemas';

/**
 * POST /api/v1/loyalty/redeem
 *
 * Issues a comp redemption (debit).
 * Supports controlled overdraw with role gating (pit_boss/admin).
 * Requires Idempotency-Key header.
 * Returns 201 for new redemption, 200 for replay.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    // Validate input
    const input = redeemInputSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createLoyaltyService(mwCtx.supabase);

        const data = await service.redeem(input);

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
        action: 'redeem',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 for new redemption, 200 for replay (idempotent)
    const status = result.data?.isExisting ? 200 : 201;
    return successResponse(ctx, result.data, 'OK', status);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
