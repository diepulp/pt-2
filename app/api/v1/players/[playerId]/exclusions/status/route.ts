/**
 * Exclusion Status Route
 *
 * GET /api/v1/players/[playerId]/exclusions/status - Get collapsed exclusion status
 *
 * Returns ExclusionStatusDTO with one of: blocked, alert, watchlist, clear.
 * Status is derived from SQL function (single source of truth for precedence).
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-052 WS1
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createExclusionService } from '@/services/player/exclusion';
import { exclusionRouteParamsSchema } from '@/services/player/exclusion-schemas';

type RouteParams = { params: Promise<{ playerId: string }> };

/**
 * GET /api/v1/players/[playerId]/exclusions/status
 *
 * Get collapsed exclusion status for a player.
 * Calls rpc_get_player_exclusion_status — casino_id derived from RLS context (ADR-024).
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      exclusionRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createExclusionService(mwCtx.supabase);
        const status = await service.getExclusionStatus(params.playerId);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: status,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-exclusion',
        action: 'get-status',
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
