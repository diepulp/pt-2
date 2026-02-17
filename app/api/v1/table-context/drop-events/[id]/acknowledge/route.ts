/**
 * Acknowledge Drop Event Route
 *
 * PATCH /api/v1/table-context/drop-events/[id]/acknowledge - Stamp drop received
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-033 Cashier Workflow MVP
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { acknowledgeDropReceived } from '@/services/table-context/chip-custody';
import { cashierRouteParamsSchema } from '@/services/table-context/schemas';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/table-context/drop-events/[id]/acknowledge
 *
 * Stamps a drop box as received at cage.
 * Requires Idempotency-Key header.
 * Idempotent: re-acknowledging returns existing row.
 * No request body needed.
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      cashierRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const dropEvent = await acknowledgeDropReceived(mwCtx.supabase, {
          dropEventId: params.id,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: dropEvent,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'acknowledge-drop-received',
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
