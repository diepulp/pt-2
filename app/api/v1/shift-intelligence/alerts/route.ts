/**
 * Alerts Route Handler
 *
 * GET /api/v1/shift-intelligence/alerts
 *
 * Retrieves persistent alerts for a given gaming day.
 * Query params: gaming_day (required), status (optional: open | acknowledged)
 *
 * @see PRD-056 §4.1 Alert Read Path
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { getAlerts } from '@/services/shift-intelligence/alerts';
import type { AlertsQuery } from '@/services/shift-intelligence/dtos';
import { alertsQuerySchema } from '@/services/shift-intelligence/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const searchParams = Object.fromEntries(
      request.nextUrl.searchParams.entries(),
    );
    const query = alertsQuerySchema.parse(searchParams) as AlertsQuery;

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const alerts = await getAlerts(mwCtx.supabase, query);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: { alerts },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'shift-intelligence',
        action: 'get-alerts',
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
