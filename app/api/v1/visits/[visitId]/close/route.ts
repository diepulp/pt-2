/**
 * Visit Close Route
 *
 * PATCH /api/v1/visits/[visitId]/close - Close visit (check-out)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-003 reference implementation
 *
 * Note: This is idempotent - closing an already-closed visit returns success.
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { CloseVisitDTO } from '@/services/visit/dtos';
import { createVisitService } from '@/services/visit/index';
import {
  closeVisitSchema,
  visitRouteParamsSchema,
} from '@/services/visit/schemas';

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ visitId: string }> };

/**
 * PATCH /api/v1/visits/[visitId]/close
 *
 * Close a visit (check-out).
 * Requires Idempotency-Key header.
 * Idempotent - closing an already-closed visit returns success.
 * Returns 404 if visit not found.
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      visitRouteParamsSchema,
    );
    const supabase = await createClient();

    // Body is optional for close
    let input: CloseVisitDTO = {};
    try {
      const body = await readJsonBody<CloseVisitDTO>(request);
      input = closeVisitSchema.parse(body);
    } catch {
      // Empty body is valid
    }

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createVisitService(mwCtx.supabase);

        // Check if visit exists
        const existing = await service.getById(params.visitId);
        if (!existing) {
          throw new DomainError('VISIT_NOT_FOUND', 'Visit not found', {
            httpStatus: 404,
            details: { visitId: params.visitId },
          });
        }

        const visit = await service.closeVisit(params.visitId, input);

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
        action: 'close',
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
