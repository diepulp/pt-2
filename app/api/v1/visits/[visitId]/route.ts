/**
 * Visit Detail Route
 *
 * GET /api/v1/visits/[visitId] - Get visit by ID
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-003 reference implementation
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createVisitService } from '@/services/visit/index';
import { visitRouteParamsSchema } from '@/services/visit/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ visitId: string }> };

/**
 * GET /api/v1/visits/[visitId]
 *
 * Get visit details by ID.
 * Returns 404 if visit not found.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      visitRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createVisitService(mwCtx.supabase);

        const visit = await service.getById(params.visitId);

        if (!visit) {
          throw new DomainError('VISIT_NOT_FOUND', 'Visit not found', {
            httpStatus: 404,
            details: { visitId: params.visitId },
          });
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data: visit,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'visit',
        action: 'detail',
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
