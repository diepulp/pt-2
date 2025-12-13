/**
 * Player Loyalty Balance Route
 *
 * GET /api/v1/players/{playerId}/loyalty - Player loyalty balance and tier info
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
import { balanceQuerySchema } from '@/services/loyalty/schemas';

/**
 * GET /api/v1/players/{playerId}/loyalty
 *
 * Gets player loyalty balance and tier info.
 * Returns null if player has no loyalty record.
 * Query params: casinoId (required)
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ playerId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const { playerId } = await segmentData.params;
    const supabase = await createClient();
    const query = parseQuery(request, balanceQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createLoyaltyService(mwCtx.supabase);

        const balance = await service.getBalance(playerId, query.casinoId);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: balance,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'get-balance',
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
