/**
 * Player Exclusion List/Create Route
 *
 * GET /api/v1/players/[playerId]/exclusions - List all exclusions
 * POST /api/v1/players/[playerId]/exclusions - Create new exclusion
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Role enforcement via RLS policies (pit_boss/admin for INSERT).
 *
 * @see ADR-042 Player Exclusion Architecture
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
import type { CreateExclusionInput } from '@/services/player/exclusion-dtos';
import { createExclusionService } from '@/services/player/exclusion';
import {
  createExclusionSchema,
  exclusionRouteParamsSchema,
} from '@/services/player/exclusion-schemas';

type RouteParams = { params: Promise<{ playerId: string }> };

/**
 * GET /api/v1/players/[playerId]/exclusions
 *
 * List all exclusions for a player (including lifted).
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
        const exclusions = await service.listExclusions(params.playerId);

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
        action: 'list',
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

/**
 * POST /api/v1/players/[playerId]/exclusions
 *
 * Create a new exclusion record.
 * Requires Idempotency-Key header.
 * Role: pit_boss, admin (enforced via RLS INSERT policy).
 * Returns 201 on success.
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      exclusionRouteParamsSchema,
    );
    const supabase = await createClient();
    const body = await readJsonBody<CreateExclusionInput>(request);

    const input = createExclusionSchema.parse({
      ...body,
      player_id: params.playerId,
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createExclusionService(mwCtx.supabase);
        const exclusion = await service.createExclusion(input);

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
        action: 'create',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
