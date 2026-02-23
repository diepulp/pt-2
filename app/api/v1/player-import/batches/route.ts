/**
 * Player Import Batch List/Create Route
 *
 * GET  /api/v1/player-import/batches - List batches (paginated)
 * POST /api/v1/player-import/batches - Create batch (idempotent)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * @see PRD-037 CSV Player Import
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
import { createPlayerImportService } from '@/services/player-import';
import {
  batchListQuerySchema,
  createBatchSchema,
} from '@/services/player-import/schemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/player-import/batches
 *
 * List import batches with cursor-based pagination.
 * Query params: status, cursor, limit
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, batchListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerImportService(mwCtx.supabase);
        const { items, cursor } = await service.listBatches({
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
        action: 'list-batches',
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
 * POST /api/v1/player-import/batches
 *
 * Create a new import batch (idempotent via idempotency_key).
 * Requires Idempotency-Key header.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<unknown>(request);
    const input = createBatchSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerImportService(mwCtx.supabase);
        const batch = await service.createBatch({
          idempotency_key: input.idempotency_key,
          file_name: input.file_name,
          vendor_label: input.vendor_label,
          column_mapping: input.column_mapping,
        });

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
        action: 'create-batch',
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
