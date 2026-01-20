/**
 * Player Recent Sessions Route
 *
 * GET /api/v1/players/[playerId]/recent-sessions - Get recent sessions for player
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-017 WS9 - Recent Sessions Route Handler
 *
 * Returns paginated list of player's recent closed sessions (last 7 days)
 * plus any current open visit. Used for "Start From Previous" UI.
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  parseParams,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { playerRouteParamsSchema } from '@/services/player/schemas';
import { createVisitService } from '@/services/visit/index';
import { recentSessionsQuerySchema } from '@/services/visit/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ playerId: string }> };

/**
 * GET /api/v1/players/[playerId]/recent-sessions
 *
 * Get player's recent closed sessions with aggregates.
 * Query params: limit (default 5, max 100), cursor (optional)
 *
 * Returns:
 * - sessions: Array of recent closed sessions (paginated)
 * - next_cursor: Pagination cursor (null if no more)
 * - open_visit: Current open visit if any (null if none)
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    // Validate route params (playerId as UUID)
    const params = parseParams(
      await segmentData.params,
      playerRouteParamsSchema,
    );

    // Validate query params (limit, cursor)
    const query = parseQuery(request, recentSessionsQuerySchema);

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Extract casinoId from RLS context (injected by auth middleware)
        if (!mwCtx.rlsContext?.casinoId) {
          throw new DomainError(
            'UNAUTHORIZED',
            'Unable to determine casino context',
            {
              httpStatus: 401,
            },
          );
        }

        const service = createVisitService(mwCtx.supabase);

        // Call service layer to fetch recent sessions
        const data = await service.getPlayerRecentSessions(
          mwCtx.rlsContext.casinoId,
          params.playerId,
          {
            limit: query.limit,
            cursor: query.cursor,
          },
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'visit',
        action: 'recent-sessions',
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
