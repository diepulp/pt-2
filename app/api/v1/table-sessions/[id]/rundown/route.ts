/**
 * Table Session Rundown Route
 *
 * PATCH /api/v1/table-sessions/[id]/rundown - Start rundown for a session
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-TABLE-SESSION-LIFECYCLE-MVP transport layer
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
import { tableSessionRouteParamsSchema } from '@/services/table-context/schemas';
import { startTableRundown } from '@/services/table-context/table-session';

export const dynamic = 'force-dynamic';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/table-sessions/[id]/rundown
 *
 * Starts rundown procedures for a table session.
 * Requires Idempotency-Key header.
 * Transitions: OPEN/ACTIVE → RUNDOWN
 *
 * Response: TableSessionDTO
 *
 * Errors:
 * - 404 SESSION_NOT_FOUND: Session does not exist
 * - 422 INVALID_STATE_TRANSITION: Session not in OPEN/ACTIVE state
 * - 403 UNAUTHORIZED: Caller is not pit_boss/admin
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      tableSessionRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const session = await startTableRundown(mwCtx.supabase, params.id);

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
        action: 'start-rundown',
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
