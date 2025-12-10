/**
 * Visit List/Create Route
 *
 * GET /api/v1/visits - List visits (paginated)
 * POST /api/v1/visits - Start visit (check-in)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-003 reference implementation
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  type ResultCode,
  successResponse,
  toHttpStatus,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { createVisitService } from "@/services/visit/index";
import {
  startVisitSchema,
  visitListQuerySchema,
} from "@/services/visit/schemas";

/**
 * GET /api/v1/visits
 *
 * List visits with cursor-based pagination.
 * Query params: player_id, status, from_date, to_date, cursor, limit
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, visitListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createVisitService(mwCtx.supabase);
        const { items, cursor } = await service.list({
          player_id: query.player_id,
          status: query.status,
          from_date: query.from_date,
          to_date: query.to_date,
          cursor: query.cursor,
          limit: query.limit,
        });

        return {
          ok: true as const,
          code: "OK" as const,
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
        domain: "visit",
        action: "list",
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      // Return the error result directly (it's already a ServiceResult)
      return NextResponse.json(result, {
        status: toHttpStatus(result.code as ResultCode),
      });
    }
    return successResponse(ctx, result.data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

/**
 * POST /api/v1/visits
 *
 * Start a visit (check-in) for a player.
 * Requires Idempotency-Key header.
 * Idempotent - returns existing active visit if one exists.
 * Returns 201 on new visit, 200 on existing.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<{ player_id: string }>(request);

    // Validate input
    const input = startVisitSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createVisitService(mwCtx.supabase);

        // Check for existing active visit first (to determine status code)
        const { has_active_visit } = await service.getActiveForPlayer(
          input.player_id,
        );

        const visit = await service.startVisit(
          input.player_id,
          mwCtx.rlsContext!.casinoId,
        );

        return {
          ok: true as const,
          code: "OK" as const,
          data: visit,
          isNew: !has_active_visit,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "visit",
        action: "start",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 for new visit, 200 for existing
    const status = (result as { isNew?: boolean }).isNew ? 201 : 200;
    return successResponse(ctx, result.data, "OK", status);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
