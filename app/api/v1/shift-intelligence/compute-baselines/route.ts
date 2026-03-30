/**
 * Compute Baselines Route Handler
 *
 * POST /api/v1/shift-intelligence/compute-baselines
 *
 * Triggers rolling baseline computation for the caller's casino.
 * Security: pit_boss/admin role required (defense-in-depth with RPC role gate).
 *
 * @see PRD-055 §4.1 Computation RPC
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  RouteError,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { computeBaselines } from '@/services/shift-intelligence/baseline';
import type { ComputeBaselineInput } from '@/services/shift-intelligence/dtos';
import { computeBaselineInputSchema } from '@/services/shift-intelligence/schemas';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['pit_boss', 'admin']);

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const raw = await readJsonBody<Record<string, unknown>>(request);
    const input = computeBaselineInputSchema.parse(raw) as ComputeBaselineInput;

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const staffRole = mwCtx.rlsContext!.staffRole;
        if (!ALLOWED_ROLES.has(staffRole)) {
          throw new RouteError(
            'FORBIDDEN',
            'Baseline computation requires pit_boss or admin role',
          );
        }

        const data = await computeBaselines(mwCtx.supabase, input);

        return {
          ok: true as const,
          code: 'OK' as const,
          data,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'shift-intelligence',
        action: 'compute-baselines',
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
