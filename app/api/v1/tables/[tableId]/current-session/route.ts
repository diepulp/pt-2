/**
 * Table Current Session Route
 *
 * GET /api/v1/tables/[tableId]/current-session - Get current active session
 *
 * Security: Uses withServerAction middleware for auth, RLS.
 * Pattern: PRD-TABLE-SESSION-LIFECYCLE-MVP transport layer
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
import { currentSessionRouteParamsSchema } from '@/services/table-context/schemas';
import { getCurrentTableSession } from '@/services/table-context/table-session';

export const dynamic = 'force-dynamic';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ tableId: string }> };

/**
 * GET /api/v1/tables/[tableId]/current-session
 *
 * Gets the current active (non-closed) session for a gaming table.
 * Returns null/404 if no active session exists.
 *
 * Response: TableSessionDTO | null
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      currentSessionRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const session = await getCurrentTableSession(
          mwCtx.supabase,
          params.tableId,
        );

        // Return 404 if no active session
        if (!session) {
          return {
            ok: false as const,
            code: 'NOT_FOUND' as const,
            error: 'No active session for this table',
            requestId: mwCtx.correlationId,
            durationMs: Date.now() - mwCtx.startedAt,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: session,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'get-current-session',
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
