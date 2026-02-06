/**
 * Reward Catalog Detail Route
 *
 * GET /api/v1/rewards/[id] - Get reward with full details
 * PATCH /api/v1/rewards/[id] - Update reward
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: ADR-033
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
import { createRewardService } from '@/services/loyalty/reward';
import {
  rewardRouteParamsSchema,
  updateRewardSchema,
} from '@/services/loyalty/reward/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/rewards/[id]
 *
 * Get reward details including child records (price points, tiers, limits, eligibility).
 * Returns 404 if reward not found.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      rewardRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRewardService(mwCtx.supabase);

        const reward = await service.getReward(params.id);

        if (!reward) {
          throw new DomainError('REWARD_NOT_FOUND', 'Reward not found', {
            httpStatus: 404,
            details: { rewardId: params.id },
          });
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: reward,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'rewards.detail',
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
 * PATCH /api/v1/rewards/[id]
 *
 * Update reward catalog entry.
 * Requires Idempotency-Key header.
 * Returns 404 if reward not found.
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      rewardRouteParamsSchema,
    );
    const supabase = await createClient();
    const body = await readJsonBody(request);

    const input = updateRewardSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRewardService(mwCtx.supabase);

        // Check if reward exists
        const existing = await service.getReward(params.id);
        if (!existing) {
          throw new DomainError('REWARD_NOT_FOUND', 'Reward not found', {
            httpStatus: 404,
            details: { rewardId: params.id },
          });
        }

        const reward = await service.updateReward({
          id: params.id,
          ...input,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: reward,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'rewards.update',
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
