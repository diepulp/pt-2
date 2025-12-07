/**
 * Player Detail/Update Route
 *
 * GET /api/v1/players/[playerId] - Get player by ID
 * PATCH /api/v1/players/[playerId] - Update player
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-003 reference implementation
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
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
import type { UpdatePlayerDTO } from '@/services/player/dtos';
import { createPlayerService } from '@/services/player/index';
import {
  playerRouteParamsSchema,
  updatePlayerSchema,
} from '@/services/player/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ playerId: string }> };

/**
 * GET /api/v1/players/[playerId]
 *
 * Get player details by ID.
 * Returns 404 if player not found or not enrolled in casino.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      playerRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerService(mwCtx.supabase);

        const player = await service.getById(params.playerId);

        if (!player) {
          throw new DomainError('PLAYER_NOT_FOUND', 'Player not found', {
            httpStatus: 404,
            details: { playerId: params.playerId },
          });
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: player,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player',
        action: 'detail',
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
 * PATCH /api/v1/players/[playerId]
 *
 * Update player profile.
 * Requires Idempotency-Key header.
 * Returns 404 if player not found.
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      playerRouteParamsSchema,
    );
    const supabase = await createClient();
    const body = await readJsonBody<UpdatePlayerDTO>(request);

    // Validate input
    const input = updatePlayerSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerService(mwCtx.supabase);

        // Check if player exists
        const existing = await service.getById(params.playerId);
        if (!existing) {
          throw new DomainError('PLAYER_NOT_FOUND', 'Player not found', {
            httpStatus: 404,
            details: { playerId: params.playerId },
          });
        }

        const player = await service.update(params.playerId, input);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: player,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player',
        action: 'update',
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
