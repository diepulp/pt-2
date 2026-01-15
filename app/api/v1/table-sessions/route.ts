/**
 * Table Sessions Route
 *
 * POST /api/v1/table-sessions - Open a new table session
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-TABLE-SESSION-LIFECYCLE-MVP transport layer
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { openTableSessionSchema } from '@/services/table-context/schemas';
import { openTableSession } from '@/services/table-context/table-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/table-sessions
 *
 * Opens a new table session.
 * Requires Idempotency-Key header.
 * Creates session in ACTIVE state (MVP: OPEN → ACTIVE is implicit).
 *
 * Request body:
 * {
 *   "gaming_table_id": "uuid"
 * }
 *
 * Response: TableSessionDTO
 *
 * Errors:
 * - 409 SESSION_ALREADY_EXISTS: Active session exists for table
 * - 403 UNAUTHORIZED: Caller is not pit_boss/admin
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await request.json();
    const parsed = openTableSessionSchema.safeParse(body);
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
        const session = await openTableSession(
          mwCtx.supabase,
          input.gaming_table_id,
        );

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
        action: 'open-session',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
