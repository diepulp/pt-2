/**
 * Promo Coupon Detail Route
 *
 * GET /api/v1/promo-coupons/[id] - Get promo coupon by ID
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-LOYALTY-PROMO
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
import { createPromoService } from "@/services/loyalty/promo";
import { promoCouponRouteParamsSchema } from "@/services/loyalty/promo/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/promo-coupons/[id]
 *
 * Get promo coupon details by ID.
 * Returns 404 if coupon not found.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      promoCouponRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPromoService(mwCtx.supabase);

        const coupon = await service.getCoupon(params.id);

        if (!coupon) {
          throw new DomainError("COUPON_NOT_FOUND", "Promo coupon not found", {
            httpStatus: 404,
            details: { couponId: params.id },
          });
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: coupon,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "loyalty",
        action: "promo-coupons.detail",
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
