/**
 * Active Visit Route
 *
 * GET /api/v1/visits/active - Get active visit for a player
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-003 reference implementation
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
import { createVisitService } from '@/services/visit/index';
import { activeVisitQuerySchema } from '@/services/visit/schemas';

/**
 * GET /api/v1/visits/active
 *
 * Get active visit for a player.
 * Query params: player_id (required)
 * Returns { has_active_visit: boolean, visit: VisitDTO | null }
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, activeVisitQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createVisitService(mwCtx.supabase);

        const activeVisit = await service.getActiveForPlayer(query.player_id);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: activeVisit,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'visit',
        action: 'active',
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
