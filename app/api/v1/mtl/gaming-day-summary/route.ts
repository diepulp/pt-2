/**
 * MTL Gaming Day Summary Route
 *
 * GET /api/v1/mtl/gaming-day-summary - Get daily aggregate compliance view
 *
 * This is the COMPLIANCE AUTHORITY surface for CTR determination.
 * Aggregates per patron + gaming_day with separate in/out totals.
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Authorization per ADR-025:
 * - Gaming Day Summary: pit_boss, admin ONLY (UI-gated, cashier excluded)
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 * @see 31 CFR § 1021.311
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { assertRole } from '@/lib/supabase/rls-context';
import { createClient } from '@/lib/supabase/server';
import { createMtlService } from '@/services/mtl';
import { mtlGamingDaySummaryQuerySchema } from '@/services/mtl/schemas';

/**
 * GET /api/v1/mtl/gaming-day-summary
 *
 * Get Gaming Day Summary - the COMPLIANCE AUTHORITY surface.
 * Returns aggregates per patron + gaming_day with separate in/out totals
 * and Tier 2 aggregate badges for CTR compliance.
 *
 * Query params:
 * - casino_id: Casino UUID (defaults to RLS context)
 * - gaming_day: Date in YYYY-MM-DD format (required)
 * - patron_uuid?: Filter by patron
 * - agg_badge_in?: Filter by cash-in aggregate badge
 * - agg_badge_out?: Filter by cash-out aggregate badge
 * - min_total_in?: Filter by minimum cash-in total
 * - min_total_out?: Filter by minimum cash-out total
 * - cursor?: Pagination cursor
 * - limit?: Max items (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, mtlGamingDaySummaryQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ADR-025: Gaming Day Summary is UI-gated to pit_boss, admin ONLY
        // Cashiers are explicitly excluded from compliance dashboard view
        assertRole(mwCtx.rlsContext!, ['pit_boss', 'admin']);

        const service = createMtlService(mwCtx.supabase);

        // Use casino_id from RLS context if not provided in query
        const filters = {
          casino_id: query.casino_id || mwCtx.rlsContext!.casinoId,
          gaming_day: query.gaming_day,
          patron_uuid: query.patron_uuid,
          agg_badge_in: query.agg_badge_in,
          agg_badge_out: query.agg_badge_out,
          min_total_in: query.min_total_in,
          min_total_out: query.min_total_out,
          cursor: query.cursor,
          limit: query.limit,
        };

        const response = await service.getGamingDaySummary(filters);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: response,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'mtl',
        action: 'get-gaming-day-summary',
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
