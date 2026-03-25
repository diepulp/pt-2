/**
 * Persist Alerts Route Handler
 *
 * POST /api/v1/shift-intelligence/persist-alerts
 *
 * Persists current anomaly alerts to shift_alert table with dedup + cooldown.
 * No role gate at route level — any authenticated staff can trigger persist.
 * RPC handles context derivation (ADR-024).
 *
 * @see PRD-056 §4.1 Persist Flow
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
import { persistAlerts } from '@/services/shift-intelligence/alerts';
import type { PersistAlertsInput } from '@/services/shift-intelligence/dtos';
import { persistAlertsInputSchema } from '@/services/shift-intelligence/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const raw = await readJsonBody<Record<string, unknown>>(request);
    const input = persistAlertsInputSchema.parse(raw) as PersistAlertsInput;

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const data = await persistAlerts(mwCtx.supabase, input);

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
        action: 'persist-alerts',
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
