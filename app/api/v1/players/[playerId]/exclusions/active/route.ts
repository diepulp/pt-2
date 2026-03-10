/**
 * Active Exclusions Route
 *
 * GET /api/v1/players/[playerId]/exclusions/active - List active exclusions
 *
 * Returns only currently active exclusions (not lifted, temporally valid).
 *
 * @see ADR-042 Player Exclusion Architecture
 * @see EXEC-050 WS5
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
 * GET /api/v1/players/[playerId]/exclusions/active
 *
 * List active exclusions for a player.
 * Filters: lifted_at IS NULL, effective_from <= now, effective_until > now or null.
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
        const exclusions = await service.getActiveExclusions(params.playerId);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: exclusions,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-exclusion',
        action: 'list-active',
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
