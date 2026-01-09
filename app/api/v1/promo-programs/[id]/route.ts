/**
 * Promo Program Detail Route
 *
 * GET /api/v1/promo-programs/[id] - Get promo program by ID
 * PATCH /api/v1/promo-programs/[id] - Update promo program
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-LOYALTY-PROMO
 */

import type { NextRequest } from "next/server";

import { DomainError } from "@/lib/errors/domain-errors";
import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { createPromoService } from "@/services/loyalty/promo";
import {
  promoProgramRouteParamsSchema,
  updatePromoProgramSchema,
} from "@/services/loyalty/promo/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/promo-programs/[id]
 *
 * Get promo program details by ID.
 * Returns 404 if program not found.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      promoProgramRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPromoService(mwCtx.supabase);

        const program = await service.getProgram(params.id);

        if (!program) {
          throw new DomainError(
            "PROMO_PROGRAM_NOT_FOUND",
            "Promo program not found",
            {
              httpStatus: 404,
              details: { programId: params.id },
            },
          );
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data: program,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "loyalty",
        action: "promo-programs.detail",
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
 * PATCH /api/v1/promo-programs/[id]
 *
 * Update promo program.
 * Requires Idempotency-Key header.
 * Returns 404 if program not found.
 */
export async function PATCH(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      promoProgramRouteParamsSchema,
    );
    const supabase = await createClient();
    const body = await readJsonBody(request);

    const input = updatePromoProgramSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createPromoService(mwCtx.supabase);

        // Check if program exists
        const existing = await service.getProgram(params.id);
        if (!existing) {
          throw new DomainError(
            "PROMO_PROGRAM_NOT_FOUND",
            "Promo program not found",
            {
              httpStatus: 404,
              details: { programId: params.id },
            },
          );
        }

        const program = await service.updateProgram({
          id: params.id,
          ...input,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data: program,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "loyalty",
        action: "promo-programs.update",
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
