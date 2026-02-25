/**
 * Latest Shift Checkpoint Route
 *
 * GET /api/v1/shift-checkpoints/latest - Get latest checkpoint
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-038 Mid-Shift Delta Checkpoints
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { getLatestCheckpoint } from '@/services/table-context/shift-checkpoint/crud';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/shift-checkpoints/latest
 *
 * Returns the most recent checkpoint for the casino.
 * Returns null data if no checkpoints exist.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const checkpoint = await getLatestCheckpoint(mwCtx.supabase);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: checkpoint,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'get-latest-checkpoint',
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
