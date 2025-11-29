/**
 * Rating Slip Resume Route
 *
 * POST /api/v1/rating-slip/[id]/resume
 *
 * Resumes a paused rating slip, closing the current pause interval.
 * Requires authentication and casino context from getAuthContext().
 *
 * Security: NEVER extract casino_id from request headers (V4 fix)
 */

import type { NextRequest } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { getAuthContext } from "@/lib/supabase/rls-context";
import { createClient } from "@/lib/supabase/server";
import { resumeSlip } from "@/services/rating-slip";
import type { Database } from "@/types/database.types";

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

    // Call service (throws DomainError on failure)
    const result = await resumeSlip(
      supabase,
      authCtx.casinoId,
      authCtx.actorId,
      ratingSlipId,
    );

    return successResponse(ctx, { success: true, slip: result });
  } catch (error) {
    if (error instanceof DomainError) {
      return errorResponse(ctx, error);
    }
    // Let Next.js handle unexpected errors
    throw error;
  }
}
