/**
 * Table Session Activate Route
 *
 * POST /api/v1/table-sessions/[id]/activate - Activate an OPEN table session
 *
 * Transitions OPEN → ACTIVE with opening attestation (custody gate).
 * Creates table_opening_attestation row with chip count, dealer confirmation,
 * and provenance chain.
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-059 Table Lifecycle Recovery
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
  activateTableSessionSchema,
  tableSessionRouteParamsSchema,
} from '@/services/table-context/schemas';
import { activateTableSession } from '@/services/table-context/table-session';

export const dynamic = 'force-dynamic';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * Body schema — strips table_session_id since it comes from route params.
 */
const activateBodySchema = activateTableSessionSchema.omit({
  table_session_id: true,
});

/**
 * POST /api/v1/table-sessions/[id]/activate
 *
 * Activates an OPEN table session with opening attestation.
 * Requires Idempotency-Key header.
 * Transitions: OPEN → ACTIVE
 *
 * Request body:
 * {
 *   "opening_total_cents": number (>= 0),
 *   "dealer_confirmed": true (literal),
 *   "opening_note"?: string | null
 * }
 *
 * Response: TableSessionDTO
 *
 * Errors:
 * - 404 SESSION_NOT_FOUND: Session does not exist
 * - 422 INVALID_STATE_TRANSITION: Session not in OPEN state
 * - 400 DEALER_NOT_CONFIRMED: dealer_confirmed is false
 * - 400 OPENING_NOTE_REQUIRED: Note required but missing
 * - 400 INVALID_OPENING_AMOUNT: opening_total_cents < 0
 * - 409 PREDECESSOR_ALREADY_CONSUMED: Predecessor snapshot already used
 * - 403 UNAUTHORIZED: Caller is not pit_boss/admin
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
    const parsed = activateBodySchema.safeParse(body);
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
        const session = await activateTableSession(mwCtx.supabase, {
          tableSessionId: params.id,
          openingTotalCents: input.opening_total_cents,
          dealerConfirmed: input.dealer_confirmed,
          openingNote: input.opening_note,
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
        action: 'activate-session',
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
