/**
 * Table Detail Route
 *
 * GET /api/v1/tables/[tableId] - Get single table
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-007 TableContextService transport layer
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { getTableById } from "@/services/table-context/crud";
import { tableRouteParamsSchema } from "@/services/table-context/schemas";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ tableId: string }> };

/**
 * GET /api/v1/tables/[tableId]
 *
 * Get single table by ID.
 */
export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      tableRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const table = await getTableById(
          mwCtx.supabase,
          params.tableId,
          mwCtx.rlsContext!.casinoId,
        );

        return {
          ok: true as const,
          code: "OK" as const,
          data: table,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "get-table",
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
