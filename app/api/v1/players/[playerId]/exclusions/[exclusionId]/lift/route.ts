/**
 * Lift Exclusion Route
 *
 * POST /api/v1/players/[playerId]/exclusions/[exclusionId]/lift
 *
 * Lifts (soft-deletes) an active exclusion.
 * Role: admin only (enforced via RLS UPDATE policy).
 *
 * @see ADR-042 Player Exclusion Architecture (D5: Lift Authority)
 * @see EXEC-050 WS5
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { LiftExclusionInput } from '@/services/player/exclusion-dtos';
import { createExclusionService } from '@/services/player/exclusion';
import {
  exclusionDetailParamsSchema,
  liftExclusionSchema,
} from '@/services/player/exclusion-schemas';

type RouteParams = {
  params: Promise<{ playerId: string; exclusionId: string }>;
};

/**
 * POST /api/v1/players/[playerId]/exclusions/[exclusionId]/lift
 *
 * Lift an exclusion record.
 * Requires Idempotency-Key header.
 * Role: admin only (enforced via RLS UPDATE policy).
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      exclusionDetailParamsSchema,
    );
    const supabase = await createClient();
    const body = await readJsonBody<LiftExclusionInput>(request);

    const input = liftExclusionSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createExclusionService(mwCtx.supabase);
        const exclusion = await service.liftExclusion(
          params.exclusionId,
          input,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: exclusion,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-exclusion',
        action: 'lift',
        requireIdempotency: true,
        idempotencyKey,
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
