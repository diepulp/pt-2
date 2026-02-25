/**
 * Table Session Close Route
 *
 * PATCH /api/v1/table-sessions/[id]/close - Close a table session
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
import {
  closeTableSessionSchema,
  tableSessionRouteParamsSchema,
} from '@/services/table-context/schemas';
import { closeTableSession } from '@/services/table-context/table-session';

export const dynamic = 'force-dynamic';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/table-sessions/[id]/close
 *
 * Closes a table session.
 * Requires Idempotency-Key header.
 * Requires at least one closing artifact (drop_event_id or closing_inventory_snapshot_id).
 * Transitions: RUNDOWN/ACTIVE → CLOSED
 *
 * Request body:
 * {
 *   "drop_event_id"?: "uuid",
 *   "closing_inventory_snapshot_id"?: "uuid",
 *   "notes"?: "string",
 *   "close_reason": "close_reason_type" (required),
 *   "close_note"?: "string" (required when close_reason="other")
 * }
 *
 * Response: TableSessionDTO
 *
 * Errors:
 * - 404 SESSION_NOT_FOUND: Session does not exist
 * - 422 INVALID_STATE_TRANSITION: Session not in RUNDOWN/ACTIVE state
 * - 400 MISSING_CLOSING_ARTIFACT: No closing artifact provided
 * - 400 CLOSE_NOTE_REQUIRED: close_reason='other' without close_note
 * - 409 UNRESOLVED_LIABILITIES: Session has unresolved items (use force-close)
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
    const body = await request.json();
    const parsed = closeTableSessionSchema.safeParse(body);
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
        const session = await closeTableSession(mwCtx.supabase, {
          sessionId: params.id,
          dropEventId: input.drop_event_id,
          closingInventorySnapshotId: input.closing_inventory_snapshot_id,
          notes: input.notes,
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
        action: 'close-session',
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
