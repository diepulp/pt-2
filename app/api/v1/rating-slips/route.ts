/**
 * Rating Slip List/Create Route
 *
 * GET /api/v1/rating-slips - List rating slips with filters
 * POST /api/v1/rating-slips - Start new rating slip
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-002 Rating Slip Service
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createRatingSlipService } from '@/services/rating-slip';
import {
  createRatingSlipSchema,
  ratingSlipListQuerySchema,
} from '@/services/rating-slip/schemas';

/**
 * GET /api/v1/rating-slips
 *
 * List rating slips with optional filters.
 * Query params: table_id?, visit_id?, status?, limit?, cursor?
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, ratingSlipListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRatingSlipService(mwCtx.supabase);

        // If table_id is provided, use listForTable
        // If visit_id is provided, use listForVisit
        // Otherwise return general list based on filters
        let items, cursor;

        if (query.table_id) {
          const response = await service.listForTable(query.table_id, {
            status: query.status,
            limit: query.limit,
            cursor: query.cursor,
          });
          items = response.items;
          cursor = response.cursor;
        } else if (query.visit_id) {
          items = await service.listForVisit(query.visit_id);
          cursor = null;
        } else {
          // For MVP, we require either table_id or visit_id filter
          // This prevents unbounded queries across all slips
          const response = await service.listForTable(query.table_id ?? '', {
            status: query.status,
            limit: query.limit,
            cursor: query.cursor,
          });
          items = response.items;
          cursor = response.cursor;
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: {
            items,
            cursor,
          },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'rating-slip',
        action: 'list',
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

/**
 * POST /api/v1/rating-slips
 *
 * Start a new rating slip for a visit at a table.
 * Requires Idempotency-Key header.
 * Returns 201 on success.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    // Validate input
    const input = createRatingSlipSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRatingSlipService(mwCtx.supabase);

        const slip = await service.start(
          mwCtx.rlsContext!.casinoId,
          mwCtx.rlsContext!.actorId,
          input,
        );

        return {
          ok: true as const,
          code: 'OK' as const,
          data: slip,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'rating-slip',
        action: 'start',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 Created for new rating slip
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
