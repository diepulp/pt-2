/**
 * Reward Earn Configuration Route
 *
 * GET /api/v1/rewards/earn-config - Get casino earn config
 * PUT /api/v1/rewards/earn-config - Upsert casino earn config
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: ADR-033
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createRewardService } from '@/services/loyalty/reward';
import { upsertEarnConfigSchema } from '@/services/loyalty/reward/schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/rewards/earn-config
 *
 * Gets the casino's earn configuration.
 * Returns null data if not yet configured.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRewardService(mwCtx.supabase);

        const config = await service.getEarnConfig();

        return {
          ok: true as const,
          code: 'OK' as const,
          data: config,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'rewards.earn-config.get',
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
 * PUT /api/v1/rewards/earn-config
 *
 * Upserts the casino's earn configuration.
 * Requires Idempotency-Key header.
 * Admin-only (enforced by RLS).
 */
export async function PUT(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    const input = upsertEarnConfigSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRewardService(mwCtx.supabase);

        const config = await service.upsertEarnConfig({
          ...input,
          casinoId: mwCtx.rlsContext!.casinoId,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: config,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'rewards.earn-config.upsert',
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
