/**
 * Player Enrollment Route
 *
 * POST /api/v1/players/[playerId]/enroll - Enroll player in casino
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-003 reference implementation
 *
 * Note: Casino ID is derived from RLS context (staff's casino).
 * This is an idempotent operation - enrolling an already-enrolled player
 * returns the existing enrollment.
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  parseParams,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { enrollPlayer } from '@/services/casino/crud';
import { createPlayerService } from '@/services/player/index';
import { playerRouteParamsSchema } from '@/services/player/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ playerId: string }> };

/**
 * POST /api/v1/players/[playerId]/enroll
 *
 * Enroll player in the authenticated user's casino.
 * Requires Idempotency-Key header.
 * Returns 200 if already enrolled (idempotent).
 * Returns 201 on new enrollment.
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      playerRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const playerService = createPlayerService(mwCtx.supabase);

        // Parallelize independent queries (P1 fix: ISSUE-983EFA10)
        const [player, existingEnrollment, staffResult] = await Promise.all([
          playerService.getById(params.playerId),
          playerService.getEnrollment(params.playerId),
          mwCtx.supabase
            .from('staff')
            .select('id, casino_id')
            .limit(1)
            .single(),
        ]);

        // Validate player exists
        if (!player) {
          throw new DomainError('PLAYER_NOT_FOUND', 'Player not found', {
            httpStatus: 404,
            details: { playerId: params.playerId },
          });
        }

        const staffData = staffResult.data;
        if (!staffData?.casino_id || !staffData.id) {
          throw new DomainError(
            'UNAUTHORIZED',
            'Unable to determine casino context or staff identity',
            {
              httpStatus: 401,
            },
          );
        }

        // SLAD Fix (ADR-022): Use CasinoService.enrollPlayer instead of PlayerService
        // player_casino table is owned by Casino bounded context
        //
        // ISSUE-2875ACCF Fix: Check if already enrolled first.
        // rpc_create_player now atomically creates player_casino enrollment,
        // so we skip the upsert if enrollment exists (avoids RLS UPDATE issue
        // where pit_boss doesn't have UPDATE permission on player_casino).
        let enrollment;
        if (existingEnrollment) {
          // Already enrolled - return existing (idempotent)
          enrollment = existingEnrollment;
        } else {
          // New enrollment needed
          enrollment = await enrollPlayer(
            mwCtx.supabase,
            params.playerId,
            staffData.casino_id,
            staffData.id, // enrolled_by
          );
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: enrollment,
          // Flag if this was a new enrollment or existing
          isNew: !existingEnrollment,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player',
        action: 'enroll',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 for new enrollment, 200 for existing
    const status = (result as { isNew?: boolean }).isNew ? 201 : 200;
    return successResponse(ctx, result.data, 'OK', status);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
