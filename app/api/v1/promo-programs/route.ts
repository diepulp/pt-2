/**
 * Promo Programs Collection Route
 *
 * GET /api/v1/promo-programs - List promo programs
 * POST /api/v1/promo-programs - Create promo program
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-LOYALTY-PROMO
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
import { createPromoService } from '@/services/loyalty/promo';
import {
  createPromoProgramSchema,
  promoProgramListQuerySchema,
} from '@/services/loyalty/promo/schemas';

/**
 * GET /api/v1/promo-programs
 *
 * Lists promo programs for the current casino.
 * Query params: status?, activeOnly?, limit?, offset?
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, promoProgramListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPromoService(mwCtx.supabase);

        const programs = await service.listPrograms(query);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: programs,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'promo-programs.list',
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
 * POST /api/v1/promo-programs
 *
 * Creates a new promo program.
 * Requires Idempotency-Key header.
 * Returns 201 for new program.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);

    const input = createPromoProgramSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPromoService(mwCtx.supabase);

        const program = await service.createProgram({
          ...input,
          casinoId: mwCtx.rlsContext!.casinoId,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: program,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'promo-programs.create',
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
