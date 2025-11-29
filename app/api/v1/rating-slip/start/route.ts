/**
 * Rating Slip Start Route
 *
 * POST /api/v1/rating-slip/start
 *
 * Creates a new rating slip in "open" state.
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
import { startSlip, type StartRatingSlipInput } from "@/services/rating-slip";
import type { Database } from "@/types/database.types";

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    // Require idempotency key for mutation
    const idempotencyKey = requireIdempotencyKey(request);

    // Create Supabase client
    const supabase = await createClient();

    // Get authenticated context (NEVER from headers)
    const authCtx = await getAuthContext(supabase);

    // Read request body
    const body = await readJsonBody<StartRatingSlipInput>(request);

    // Call service (throws DomainError on failure)
    const result = await startSlip(
      supabase,
      authCtx.casinoId,
      authCtx.actorId,
      body,
    );

    return successResponse(ctx, { ratingSlipId: result.id });
  } catch (error) {
    if (error instanceof DomainError) {
      return errorResponse(ctx, error);
    }
    // Let Next.js handle unexpected errors
    throw error;
  }
}
