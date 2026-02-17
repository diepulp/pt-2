/**
 * Eligible Rewards Route
 *
 * GET /api/v1/rewards/eligible?playerId=X - List rewards eligible for a player
 *
 * Reads: reward_catalog, reward_eligibility, reward_price_points,
 *        reward_entitlement_tier, player_loyalty — all Loyalty-owned per SRM §401-435.
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: ADR-033
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
import { createRewardService } from '@/services/loyalty/reward';
import { eligibleRewardsQuerySchema } from '@/services/loyalty/reward/schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/rewards/eligible?playerId=X
 *
 * Lists rewards eligible for a given player.
 * Combines catalog, eligibility rules, price points, tiers, and player loyalty data.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, eligibleRewardsQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRewardService(mwCtx.supabase);

        const eligible = await service.listEligibleRewards(query.playerId);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: eligible,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'rewards.eligible.list',
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
