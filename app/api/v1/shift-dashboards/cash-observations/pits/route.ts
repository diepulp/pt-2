/**
 * Cash Observations Pit Rollups Route Handler
 *
 * GET /api/v1/shift-dashboards/cash-observations/pits
 *
 * Returns per-pit cash observation rollups for a time window.
 * TELEMETRY-ONLY: These are observational, NOT authoritative metrics.
 *
 * Security: Casino scope derived from RLS context (ADR-015)
 * @see PRD-Shift-Dashboards-v0.2
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { getShiftCashObsPit } from '@/services/table-context/shift-cash-obs';
import { cashObsPitsQuerySchema } from '@/services/table-context/shift-metrics/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const params = cashObsPitsQuerySchema.parse({
      start: searchParams.get('start'),
      end: searchParams.get('end'),
      pit: searchParams.get('pit') ?? undefined,
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const rollups = await getShiftCashObsPit(mwCtx.supabase, {
          casinoId,
          startTs: params.start,
          endTs: params.end,
          pit: params.pit,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: rollups,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'cash-obs.pits',
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
