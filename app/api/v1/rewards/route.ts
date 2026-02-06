/**
 * Reward Catalog Collection Route
 *
 * GET /api/v1/rewards - List reward catalog
 * POST /api/v1/rewards - Create reward + child records
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: ADR-033
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createRewardService } from '@/services/loyalty/reward';
import {
  createRewardSchema,
  rewardListQuerySchema,
} from '@/services/loyalty/reward/schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/rewards
 *
 * Lists reward catalog entries for the current casino.
 * Query params: family?, kind?, isActive?, search?, limit?, offset?
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, rewardListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRewardService(mwCtx.supabase);

        const rewards = await service.listRewards(query);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: rewards,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'rewards.list',
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
 * POST /api/v1/rewards
 *
 * Creates a new reward catalog entry with optional child records.
 * Requires Idempotency-Key header.
 * Returns 201 for new reward.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    const input = createRewardSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRewardService(mwCtx.supabase);

        const reward = await service.createReward({
          ...input,
          casinoId: mwCtx.rlsContext!.casinoId,
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
        action: 'rewards.create',
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
