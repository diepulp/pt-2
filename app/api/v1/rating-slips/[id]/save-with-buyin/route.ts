/**
 * Rating Slip Save-with-BuyIn Route
 *
 * POST /api/v1/rating-slips/[id]/save-with-buyin - Atomically save average_bet + buy-in
 *
 * PERF-005 WS7: Composite operation replacing sequential PATCH + POST pattern.
 * Eliminates 4,935ms save-flow latency by combining average_bet update and
 * financial transaction into a single database roundtrip.
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * ADR-024: RLS context self-injected via set_rls_context_from_staff().
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
import { saveWithBuyIn } from "@/services/rating-slip/crud";
import {
  ratingSlipRouteParamsSchema,
  saveWithBuyInSchema,
} from "@/services/rating-slip/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/rating-slips/[id]/save-with-buyin
 *
 * Atomically update average_bet and record buy-in transaction.
 * Requires Idempotency-Key header.
 * Returns composite result with updated slip and transaction ID.
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

    const body = await readJsonBody(request);
    const input = saveWithBuyInSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ADR-024: RPC self-injects context — no casinoId/actorId needed
        const saveResult = await saveWithBuyIn(mwCtx.supabase, params.id, {
          average_bet: input.average_bet,
          buyin_amount_cents: input.buyin_amount_cents ?? null,
          buyin_type: input.buyin_type,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data: saveResult,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "rating-slip",
        action: "save-with-buyin",
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
