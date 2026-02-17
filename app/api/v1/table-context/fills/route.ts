/**
 * Table Fill Route
 *
 * POST /api/v1/table-context/fills - Request table fill
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-007 TableContextService chip custody operations
 * Transport: Route Handler ONLY (hardware integration, custody chain)
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import {
  listFills,
  requestTableFill,
} from '@/services/table-context/chip-custody';
import {
  fillListQuerySchema,
  requestTableFillSchema,
} from '@/services/table-context/schemas';

/**
 * GET /api/v1/table-context/fills
 *
 * List fills with optional filters (status, gaming_day).
 * If gaming_day not provided, defaults to current via rpc_current_gaming_day().
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, fillListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        let gamingDay = query.gaming_day;
        if (!gamingDay) {
          const { data } = await mwCtx.supabase.rpc('rpc_current_gaming_day');
          gamingDay = data ?? undefined;
        }

        const fills = await listFills(mwCtx.supabase, {
          status: query.status,
          gaming_day: gamingDay,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: fills,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'list-fills',
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
 * POST /api/v1/table-context/fills
 *
 * Request table fill from cage.
 * Requires Idempotency-Key header.
 * Idempotent via request_id - duplicate requests return existing fill.
 * Used by hardware integrations (chip scanners) and manual requests.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<Record<string, unknown>>(request);

    // Validate input
    const input = requestTableFillSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const fill = await requestTableFill(mwCtx.supabase, {
          casinoId: mwCtx.rlsContext!.casinoId,
          tableId: input.table_id,
          requestId: input.request_id,
          chipset: input.chipset,
          amountCents: input.amount_cents,
          deliveredBy: input.delivered_by,
          receivedBy: input.received_by,
          slipNo: input.slip_no,
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
        action: 'request-table-fill',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
