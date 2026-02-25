/**
 * Finalize Rundown Report Route
 *
 * PATCH /api/v1/table-rundown-reports/[id]/finalize - Finalize report
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-038 Shift Rundown Persistence
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
import { finalizeRundown } from '@/services/table-context/rundown-report/crud';
import { rundownRouteParamsSchema } from '@/services/table-context/rundown-report/schemas';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/table-rundown-reports/[id]/finalize
 *
 * Finalizes a rundown report (stamps finalized_at/finalized_by).
 * Requires Idempotency-Key header.
 * Requires session to be CLOSED.
 *
 * Errors:
 * - 409 TABLE_RUNDOWN_ALREADY_FINALIZED: Report already finalized
 * - 400 TABLE_RUNDOWN_SESSION_NOT_CLOSED: Session not CLOSED yet
 * - 404 TABLE_RUNDOWN_NOT_FOUND: Report does not exist
 * - 403 FORBIDDEN: Role lacks authorization
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      rundownRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const report = await finalizeRundown(mwCtx.supabase, params.id);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: report,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'finalize-rundown-report',
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
