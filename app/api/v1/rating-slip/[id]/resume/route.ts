/**
 * Rating Slip Resume Route
 *
 * POST /api/v1/rating-slip/[id]/resume
 *
 * Resumes a paused rating slip, closing the current pause interval.
 * Uses composable middleware for auth, RLS, idempotency, and audit.
 *
 * Security: NEVER extract casino_id from request headers (V4 fix)
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { resumeSlip } from "@/services/rating-slip";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const ratingSlipId = params.id;

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const slip = await resumeSlip(
          mwCtx.supabase,
          mwCtx.rlsContext!.casinoId,
          mwCtx.rlsContext!.actorId,
          ratingSlipId,
        );
        return {
          ok: true as const,
          code: "OK" as const,
          data: { success: true, slip },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "rating-slip",
        action: "resume",
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
