/**
 * Closed Rating Slips for Gaming Day Route
 *
 * GET /api/v1/rating-slips/closed-today - List closed terminal slips for current gaming day
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-020 Closed Sessions Panel
 *
 * ISSUE-SFP-001 Fix: Uses keyset pagination with (end_time, id) tuple cursor.
 * Only returns terminal slips (excludes intermediate move slips).
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createCasinoService } from '@/services/casino';
import { createRatingSlipService } from '@/services/rating-slip';
import { closedTodayQuerySchema } from '@/services/rating-slip/schemas';

/**
 * GET /api/v1/rating-slips/closed-today
 *
 * List closed terminal rating slips for the current gaming day.
 * Gaming day is computed from the casino's timezone settings.
 *
 * ISSUE-SFP-001: Uses keyset pagination with (end_time, id) cursor tuple.
 * Only returns terminal slips (excludes intermediate move slips).
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, closedTodayQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ========================================================================
        // SECURITY: casinoId MUST come from validated middleware context, NOT query params
        // withServerAction extracts casinoId from JWT claims → mwCtx.rlsContext.casinoId
        // This is authoritative - never trust client-provided casino identifiers
        // ========================================================================
        const casinoId = mwCtx.rlsContext!.casinoId;

        // Get current gaming day for the casino (informational for response)
        const casinoService = createCasinoService(mwCtx.supabase);
        const gamingDayInfo = await casinoService.computeGamingDay(casinoId);
        const gamingDay = gamingDayInfo.gaming_day;

        // ADR-024: RPC derives casino scope internally via set_rls_context_from_staff()
        // No casinoId passed to service - RPC enforces tenant isolation
        const ratingSlipService = createRatingSlipService(mwCtx.supabase);

        // Build keyset cursor from query params (both must be present or neither)
        const cursor =
          query.cursor_end_time && query.cursor_id
            ? { endTime: query.cursor_end_time, id: query.cursor_id }
            : null;

        const result = await ratingSlipService.listClosedForGamingDay(
          gamingDay,
          {
            limit: query.limit,
            cursor,
          },
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: {
            items: result.items,
            cursor: result.cursor, // Now { endTime, id } | null
            gamingDay, // Informational - not used for filtering
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'rating-slip',
        action: 'list-closed-today',
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
