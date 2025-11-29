/**
 * Rating Slip Start Route
 *
 * POST /api/v1/rating-slip/start
 *
 * Creates a new rating slip in "open" state.
 * Uses composable middleware for auth, RLS, idempotency, and audit.
 *
 * Security: NEVER extract casino_id from request headers (V4 fix)
 * Pattern: WS5 reference implementation
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
import { startSlip, type StartRatingSlipInput } from "@/services/rating-slip";

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    // Require idempotency key for mutation
    const idempotencyKey = requireIdempotencyKey(request);

    // Create Supabase client
    const supabase = await createClient();

    // Read request body
    const body = await readJsonBody<StartRatingSlipInput>(request);

    // Middleware handles auth, RLS, idempotency, audit, tracing
    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Auth context available via mwCtx.rlsContext
        const slip = await startSlip(
          mwCtx.supabase,
          mwCtx.rlsContext!.casinoId,
          mwCtx.rlsContext!.actorId,
          body,
        );
        // Return ServiceResult<T> with data
        return {
          ok: true as const,
          code: "OK" as const,
          data: { ratingSlipId: slip.id },
          requestId: mwCtx.correlationId,
          durationMs: 0, // Will be overwritten by tracing middleware
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "rating-slip",
        action: "start",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, "OK", 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
