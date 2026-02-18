/**
 * Visit Financial Summary Route
 *
 * GET /api/v1/visits/[visitId]/financial-summary - Get aggregated financial totals for a visit
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-009 Player Financial Service
 *
 * Returns:
 * - total_in: Sum of all 'in' direction transactions
 * - total_out: Sum of all 'out' direction transactions
 * - net_amount: total_in - total_out
 * - event_count: Number of transactions
 * - first_transaction_at: Timestamp of first transaction
 * - last_transaction_at: Timestamp of last transaction
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
import { createPlayerFinancialService } from '@/services/player-financial';
import { visitFinancialSummaryRouteParamsSchema } from '@/services/player-financial/schemas';

/**
 * GET /api/v1/visits/[visitId]/financial-summary
 *
 * Get aggregated financial summary for a visit.
 * Returns summary even if no transactions exist (zeros for all amounts).
 * RLS automatically filters by casino_id.
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ visitId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    // MUST await params in Next.js 15
    const params = await segmentData.params;
    const { visitId } = parseParams(
      params,
      visitFinancialSummaryRouteParamsSchema,
    );

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerFinancialService(mwCtx.supabase);

        const summary = await service.getVisitSummary(visitId);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: summary,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-financial',
        action: 'getVisitSummary',
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
