/**
 * Financial Transaction Detail Route
 *
 * GET /api/v1/financial-transactions/[id] - Get single financial transaction by ID
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-009 Player Financial Service
 *
 * Returns 404 if transaction not found or not accessible by current casino context.
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
import { financialTxnRouteParamsSchema } from '@/services/player-financial/schemas';

/**
 * GET /api/v1/financial-transactions/[id]
 *
 * Get a single financial transaction by ID.
 * Returns 404 if not found.
 * RLS automatically filters by casino_id.
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ id: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    // MUST await params in Next.js 15
    const params = await segmentData.params;
    const { id } = parseParams(params, financialTxnRouteParamsSchema);

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPlayerFinancialService(mwCtx.supabase);

        const transaction = await service.getById(id);

        if (!transaction) {
          return {
            ok: false as const,
            code: 'NOT_FOUND' as const,
            error: `Financial transaction with ID '${id}' not found`,
            requestId: mwCtx.correlationId,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: transaction,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-financial',
        action: 'get',
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
