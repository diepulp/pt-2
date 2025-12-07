/**
 * Dealer Rotation Route
 *
 * POST /api/v1/tables/[tableId]/dealer - Assign dealer to table
 * DELETE /api/v1/tables/[tableId]/dealer - End current dealer rotation
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-007 TableContextService transport layer
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
import {
  assignDealer,
  endDealerRotation,
} from '@/services/table-context/dealer-rotation';
import {
  assignDealerSchema,
  tableRouteParamsSchema,
} from '@/services/table-context/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ tableId: string }> };

/**
 * POST /api/v1/tables/[tableId]/dealer
 *
 * Assign dealer to table.
 * Requires Idempotency-Key header.
 * Auto-ends any current rotation before starting new one.
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      tableRouteParamsSchema,
    );
    const supabase = await createClient();
    const body = await readJsonBody<{ staff_id: string }>(request);

    // Validate input
    const input = assignDealerSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const rotation = await assignDealer(
          mwCtx.supabase,
          params.tableId,
          mwCtx.rlsContext!.casinoId,
          input.staff_id,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: rotation,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'assign-dealer',
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

/**
 * DELETE /api/v1/tables/[tableId]/dealer
 *
 * End current dealer rotation for table.
 * Requires Idempotency-Key header.
 * Returns 404 if no active rotation exists.
 */
export async function DELETE(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      tableRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const rotation = await endDealerRotation(
          mwCtx.supabase,
          params.tableId,
          mwCtx.rlsContext!.casinoId,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: rotation,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'end-dealer-rotation',
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
