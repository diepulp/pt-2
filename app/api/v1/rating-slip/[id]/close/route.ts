/**
 * Rating Slip Close Route
 *
 * POST /api/v1/rating-slip/[id]/close
 *
 * Closes a rating slip with final telemetry (average bet).
 * Returns calculated points and duration.
 * Requires authentication and casino context from getAuthContext().
 *
 * Security: NEVER extract casino_id from request headers (V4 fix)
 */

import type { NextRequest } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { getAuthContext } from "@/lib/supabase/rls-context";
import { createClient } from "@/lib/supabase/server";
import { closeSlip } from "@/services/rating-slip";
import type { Database } from "@/types/database.types";

interface CloseRatingSlipRequest {
  averageBet?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = createRequestContext(request);

  try {
    // Require idempotency key for mutation
    const idempotencyKey = requireIdempotencyKey(request);

    // Create Supabase client
    const supabase = await createClient();

    // Get authenticated context (NEVER from headers)
    const authCtx = await getAuthContext(supabase);

    // Extract rating slip ID from route params
    const ratingSlipId = params.id;

    // Read optional request body (averageBet)
    let body: CloseRatingSlipRequest = {};
    try {
      body = await readJsonBody<CloseRatingSlipRequest>(request);
    } catch (e) {
      // Body is optional, ignore parsing errors
    }

    // Call service (throws DomainError on failure)
    const result = await closeSlip(
      supabase,
      authCtx.casinoId,
      authCtx.actorId,
      ratingSlipId,
      body.averageBet,
    );

    return successResponse(ctx, {
      slip: result,
      durationSeconds: result.duration_seconds,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return errorResponse(ctx, error);
    }
    // Let Next.js handle unexpected errors
    throw error;
  }
}
