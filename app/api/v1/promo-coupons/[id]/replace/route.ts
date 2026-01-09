/**
 * Promo Coupon Replace Route
 *
 * POST /api/v1/promo-coupons/[id]/replace - Replace a promo coupon
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-LOYALTY-PROMO
 * Idempotency: Required - dedupes via idempotency_key
 */

import type { NextRequest } from "next/server";

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
import { createPromoService } from "@/services/loyalty/promo";
import {
  promoCouponRouteParamsSchema,
  replaceCouponSchema,
} from "@/services/loyalty/promo/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/promo-coupons/[id]/replace
 *
 * Replaces a promo coupon with a new one.
 * Requires Idempotency-Key header.
 * Returns 201 for new replacement, 200 for duplicate (idempotent).
 *
 * Idempotency key should be: "replace:{couponId}:{newValidationNumber}"
 *
 * @throws COUPON_NOT_FOUND (404) - Coupon doesn't exist
 * @throws INVALID_COUPON_STATUS (422) - Coupon cannot be replaced (already voided/replaced/cleared)
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      promoCouponRouteParamsSchema,
    );
    const supabase = await createClient();
    const body = await readJsonBody(request);

    const input = replaceCouponSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPromoService(mwCtx.supabase);

        const data = await service.replaceCoupon({
          couponId: params.id,
          newValidationNumber: input.newValidationNumber,
          newExpiresAt: input.newExpiresAt,
          idempotencyKey,
          correlationId: input.correlationId ?? mwCtx.correlationId,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "loyalty",
        action: "promo-coupons.replace",
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
    return successResponse(ctx, result.data, "OK", status);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
