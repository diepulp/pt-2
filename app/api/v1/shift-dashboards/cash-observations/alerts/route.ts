/**
 * Cash Observations Alerts Route Handler
 *
 * GET /api/v1/shift-dashboards/cash-observations/alerts
 *
 * Returns cash observation spike alerts for a time window.
 * Alerts trigger when observed totals exceed configured thresholds.
 * TELEMETRY-ONLY: These are observational alerts, NOT authoritative.
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
import { getShiftCashObsAlerts } from '@/services/table-context/shift-cash-obs';
import { cashObsAlertsQuerySchema } from '@/services/table-context/shift-metrics/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const params = cashObsAlertsQuerySchema.parse({
      start: searchParams.get('start'),
      end: searchParams.get('end'),
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const alerts = await getShiftCashObsAlerts(mwCtx.supabase, {
          casinoId,
          startTs: params.start,
          endTs: params.end,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: alerts,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'cash-obs.alerts',
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
