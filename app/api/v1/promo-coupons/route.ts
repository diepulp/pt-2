/**
 * Promo Coupons Collection Route
 *
 * GET /api/v1/promo-coupons - List promo coupons
 * POST /api/v1/promo-coupons - Issue promo coupon
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-LOYALTY-PROMO
 * Idempotency: Required for POST - dedupes via idempotency_key + validation_number
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createPromoService } from '@/services/loyalty/promo';
import {
  issueCouponSchema,
  promoCouponListQuerySchema,
} from '@/services/loyalty/promo/schemas';

/**
 * GET /api/v1/promo-coupons
 *
 * Lists promo coupons for the current casino.
 * Query params: promoProgramId?, status?, playerId?, visitId?, expiringBefore?, limit?, offset?
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, promoCouponListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPromoService(mwCtx.supabase);

        const coupons = await service.listCoupons(query);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: coupons,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'promo-coupons.list',
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

/**
 * POST /api/v1/promo-coupons
 *
 * Issues a new promo coupon.
 * Requires Idempotency-Key header.
 * Returns 201 for new issuance, 200 for duplicate (idempotent).
 *
 * Idempotency key should be: "issue:{validationNumber}"
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    const input = issueCouponSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPromoService(mwCtx.supabase);

        const data = await service.issueCoupon({
          ...input,
          idempotencyKey,
          correlationId: input.correlationId ?? mwCtx.correlationId,
        });

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
        action: 'promo-coupons.issue',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 200 for duplicate (isExisting), 201 for new
    const status = result.data?.isExisting ? 200 : 201;
    return successResponse(ctx, result.data, 'OK', status);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
