/**
 * Player Import Batch Detail Route
 *
 * GET /api/v1/player-import/batches/[id] - Get batch + report summary
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * @see PRD-037 CSV Player Import
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  parseParams,
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
 * GET /api/v1/player-import/batches/[id]
 *
 * Get batch details including report_summary.
 * Returns 404 if batch not found or not visible.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(await segmentData.params, batchIdParamSchema);
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerImportService(mwCtx.supabase);
        const batch = await service.getBatch(params.id);

        if (!batch) {
          throw new DomainError('IMPORT_BATCH_NOT_FOUND');
        }

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
        action: 'get-batch',
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
