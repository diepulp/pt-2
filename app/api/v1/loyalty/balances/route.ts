/**
 * Loyalty Balance Route (FR-11)
 *
 * GET /api/v1/loyalty/balances - Get player loyalty balance by query params
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: Follows GET /api/v1/players/[playerId]/loyalty (already wired).
 *
 * @see PRD-052 FR-11
 * @see EXEC-052 WS3
 */

import { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createLoyaltyService } from '@/services/loyalty';
import { loyaltyBalanceQuerySchema } from '@/services/loyalty/schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/loyalty/balances
 *
 * Gets player loyalty balance and tier info.
 * Returns null if player has no loyalty record.
 * Query params: player_id, casino_id (both required).
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, loyaltyBalanceQuerySchema);
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createLoyaltyService(mwCtx.supabase);

        const balance = await service.getBalance(
          query.player_id,
          query.casino_id,
        );

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
