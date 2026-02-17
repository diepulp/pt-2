/**
 * Confirm Table Fill Route
 *
 * PATCH /api/v1/table-context/fills/[id]/confirm - Confirm fill fulfillment
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-033 Cashier Workflow MVP
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { confirmTableFill } from '@/services/table-context/chip-custody';
import {
  cashierRouteParamsSchema,
  confirmTableFillSchema,
} from '@/services/table-context/schemas';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/table-context/fills/[id]/confirm
 *
 * Confirms a table fill fulfillment by cashier.
 * Requires Idempotency-Key header.
 * Idempotent: re-confirming a confirmed fill returns existing row.
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
    const body = await readJsonBody<Record<string, unknown>>(request);
    const input = confirmTableFillSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const fill = await confirmTableFill(mwCtx.supabase, {
          fillId: params.id,
          confirmedAmountCents: input.confirmed_amount_cents,
          discrepancyNote: input.discrepancy_note,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: fill,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'confirm-table-fill',
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
