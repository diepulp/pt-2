/**
 * Floor Layout List/Create Route
 *
 * GET /api/v1/floor-layouts - List floor layouts with filters
 * POST /api/v1/floor-layouts - Create new floor layout
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-004 Floor Layout Service
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { createFloorLayoutService } from "@/services/floor-layout";
import {
  createFloorLayoutSchema,
  floorLayoutListQuerySchema,
} from "@/services/floor-layout/schemas";

/**
 * GET /api/v1/floor-layouts
 *
 * List floor layouts with optional filters.
 * Query params: casino_id, status?, cursor?, limit?
 *
 * RLS scopes results to casino automatically.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, floorLayoutListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createFloorLayoutService(mwCtx.supabase);

        const { items, cursor } = await service.listLayouts({
          casino_id: query.casino_id,
          status: query.status,
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
        domain: "floor-layout",
        action: "list",
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
 * POST /api/v1/floor-layouts
 *
 * Create a new floor layout.
 * Requires Idempotency-Key header.
 * Uses rpc_create_floor_layout RPC for transactional creation.
 *
 * Returns 201 on success.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);
    const payload = createFloorLayoutSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Call RPC with validated payload
        const { data, error } = await mwCtx.supabase.rpc(
          "rpc_create_floor_layout",
          {
            p_casino_id: payload.casino_id,
            p_name: payload.name,
            p_description: payload.description,
          },
        );

        if (error) {
          throw error;
        }

        return {
          ok: true as const,
          code: "OK" as const,
          data,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "floor-layout",
        action: "create",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 Created for new layout
    return successResponse(ctx, result.data, "OK", 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
