/**
 * Anomaly Alerts Route Handler
 *
 * GET /api/v1/shift-intelligence/anomaly-alerts
 *
 * Returns baseline-aware anomaly alerts for the caller's casino.
 * Each table/metric pair includes readiness state and anomaly evaluation.
 * Security: pit_boss/admin role required.
 *
 * @see PRD-055 §4.1 Anomaly Alert RPC
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  RouteError,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { getAnomalyAlerts } from '@/services/shift-intelligence/anomaly';
import { anomalyAlertsQuerySchema } from '@/services/shift-intelligence/schemas';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['pit_boss', 'admin']);

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const query = anomalyAlertsQuerySchema.parse({
      window_start: searchParams.get('window_start'),
      window_end: searchParams.get('window_end'),
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const staffRole = mwCtx.rlsContext!.staffRole;
        if (!ALLOWED_ROLES.has(staffRole)) {
          throw new RouteError(
            'FORBIDDEN',
            'Anomaly alerts require pit_boss or admin role',
          );
        }

        const data = await getAnomalyAlerts(mwCtx.supabase, query);

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
        action: 'anomaly-alerts',
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
