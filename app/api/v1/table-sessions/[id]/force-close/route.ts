/**
 * Table Session Force-Close Route (PRD-038A)
 *
 * POST /api/v1/table-sessions/[id]/force-close - Force close a table session
 *
 * Privileged operation for pit_boss/admin roles.
 * Skips unresolved liabilities check, sets requires_reconciliation=true.
 * Emits audit_log entry for compliance.
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-038A close governance transport layer
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
import {
  forceCloseTableSessionSchema,
  tableSessionRouteParamsSchema,
} from '@/services/table-context/schemas';
import { forceCloseTableSession } from '@/services/table-context/table-session';

export const dynamic = 'force-dynamic';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/table-sessions/[id]/force-close
 *
 * Force-closes a table session (privileged).
 * Requires Idempotency-Key header.
 * Requires pit_boss or admin role (enforced by RPC).
 *
 * Request body:
 * {
 *   "close_reason": "close_reason_type" (required),
 *   "close_note"?: "string" (required when close_reason="other")
 * }
 *
 * Response: TableSessionDTO
 *
 * Errors:
 * - 400 VALIDATION_ERROR: Invalid request body
 * - 400 CLOSE_NOTE_REQUIRED: close_reason='other' without close_note
 * - 403 UNAUTHORIZED: Caller is not pit_boss/admin
 * - 404 SESSION_NOT_FOUND: Session does not exist
 * - 409 INVALID_STATE_TRANSITION: Session is already closed
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      tableSessionRouteParamsSchema,
    );
    const body = await request.json();
    const parsed = forceCloseTableSessionSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(ctx, {
        ok: false,
        code: 'VALIDATION_ERROR',
        status: 400,
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }
    const input = parsed.data;
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const session = await forceCloseTableSession(mwCtx.supabase, {
          sessionId: params.id,
          closeReason: input.close_reason,
          closeNote: input.close_note,
        });

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
        action: 'force-close-session',
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
