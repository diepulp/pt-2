/**
 * Table Rundown Report By ID Route
 *
 * GET /api/v1/table-rundown-reports/[id] - Get report by ID
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-038 Shift Rundown Persistence
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { getRundownById } from '@/services/table-context/rundown-report/crud';
import { rundownRouteParamsSchema } from '@/services/table-context/rundown-report/schemas';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/table-rundown-reports/[id]
 *
 * Returns a single rundown report by ID.
 * Casino scope enforced via RLS.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      rundownRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const report = await getRundownById(mwCtx.supabase, params.id);

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
        action: 'get-rundown-report',
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
