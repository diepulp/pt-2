/**
 * Player Import Execute Route
 *
 * POST /api/v1/player-import/batches/[id]/execute - Execute merge (idempotent)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * @see PRD-037 CSV Player Import
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
import { createPlayerImportService } from '@/services/player-import';
import { batchIdParamSchema } from '@/services/player-import/schemas';

export const dynamic = 'force-dynamic';

/** Route params type for Next.js 16 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/player-import/batches/[id]/execute
 *
 * Execute the import merge for a batch.
 * Requires Idempotency-Key header.
 * Idempotent - re-execution returns same completed report.
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(await segmentData.params, batchIdParamSchema);
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerImportService(mwCtx.supabase);
        const batch = await service.executeBatch(params.id);

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
        action: 'execute',
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
