/**
 * Player Import Row List/Stage Route
 *
 * GET  /api/v1/player-import/batches/[id]/rows - List rows (paginated)
 * POST /api/v1/player-import/batches/[id]/rows - Stage rows (max 2000, idempotent)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * @see PRD-037 CSV Player Import
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createPlayerImportService } from '@/services/player-import';
import {
  batchIdParamSchema,
  rowListQuerySchema,
  stageRowsSchema,
} from '@/services/player-import/schemas';

export const dynamic = 'force-dynamic';

/** Route params type for Next.js 16 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/player-import/batches/[id]/rows
 *
 * List rows within a batch with cursor-based pagination.
 * Query params: status, cursor, limit
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(await segmentData.params, batchIdParamSchema);
    const supabase = await createClient();
    const query = parseQuery(request, rowListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerImportService(mwCtx.supabase);
        const { items, cursor } = await service.listRows(params.id, {
          status: query.status,
          cursor: query.cursor,
          limit: query.limit,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: { items, cursor },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-import',
        action: 'list-rows',
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
 * POST /api/v1/player-import/batches/[id]/rows
 *
 * Stage rows into a batch (max 2000 per chunk, idempotent per row_number).
 * Requires Idempotency-Key header.
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(await segmentData.params, batchIdParamSchema);
    const supabase = await createClient();
    const body = await readJsonBody<unknown>(request);
    const input = stageRowsSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerImportService(mwCtx.supabase);
        const batch = await service.stageRows(params.id, input.rows);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: batch,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-import',
        action: 'stage-rows',
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
