/**
 * Rating Slip Close Route
 *
 * POST /api/v1/rating-slip/[id]/close
 *
 * Closes a rating slip with final telemetry (average bet).
 * Returns calculated points and duration.
 * Uses composable middleware for auth, RLS, idempotency, and audit.
 *
 * Security: NEVER extract casino_id from request headers (V4 fix)
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { closeSlip } from "@/services/rating-slip";

interface CloseRatingSlipRequest {
  averageBet?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const ratingSlipId = params.id;

    // Read optional request body (averageBet)
    let body: CloseRatingSlipRequest = {};
    try {
      body = await readJsonBody<CloseRatingSlipRequest>(request);
    } catch {
      // Body is optional, ignore parsing errors
    }

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const slip = await closeSlip(
          mwCtx.supabase,
          mwCtx.rlsContext!.casinoId,
          mwCtx.rlsContext!.actorId,
          ratingSlipId,
          body.averageBet,
        );
        return {
          ok: true as const,
          code: "OK" as const,
          data: { slip, durationSeconds: slip.duration_seconds },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "rating-slip",
        action: "close",
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
