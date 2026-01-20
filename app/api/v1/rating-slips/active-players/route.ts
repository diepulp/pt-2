/**
 * Casino-Wide Active Players Route
 *
 * GET /api/v1/rating-slips/active-players - List all active players across casino
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: GAP-ACTIVITY-PANEL-CASINO-WIDE
 *
 * ADR-024 compliant: RPC derives casino scope via set_rls_context_from_staff().
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
import { createRatingSlipService } from '@/services/rating-slip';
import { activePlayersCasinoWideQuerySchema } from '@/services/rating-slip/schemas';

/**
 * GET /api/v1/rating-slips/active-players
 *
 * List all active (open/paused) players across all tables in the casino.
 * Used by the Activity Panel for casino-wide player lookup.
 *
 * Query params:
 * - search: Filter by player name (optional)
 * - limit: Max results, default 100, max 200 (optional)
 *
 * Response: { items: ActivePlayerForDashboardDTO[], count: number }
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, activePlayersCasinoWideQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ADR-024: RPC derives casino scope internally via set_rls_context_from_staff()
        // No casinoId passed to service - RPC enforces tenant isolation
        const ratingSlipService = createRatingSlipService(mwCtx.supabase);

        const items = await ratingSlipService.listActivePlayersCasinoWide({
          search: query.search,
          limit: query.limit,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: {
            items,
            count: items.length,
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'rating-slip',
        action: 'list-active-players-casino-wide',
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
