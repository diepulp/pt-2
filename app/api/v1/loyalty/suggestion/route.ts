/**
 * Loyalty Suggestion Route
 *
 * GET /api/v1/loyalty/suggestion - Evaluate session reward suggestion (read-only)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-004 Loyalty Service
 * Idempotency: Not required (read-only operation)
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createLoyaltyService } from '@/services/loyalty';
import { suggestionQuerySchema } from '@/services/loyalty/schemas';

/**
 * GET /api/v1/loyalty/suggestion
 *
 * Evaluates session reward suggestion (read-only).
 * Does NOT mint points - used for UI preview during active sessions.
 * Query params: ratingSlipId (required), asOfTs (optional)
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, suggestionQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createLoyaltyService(mwCtx.supabase);

        const suggestion = await service.evaluateSuggestion(
          query.ratingSlipId,
          query.asOfTs,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: suggestion,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'suggestion',
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
