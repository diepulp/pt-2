/**
 * Table Close Route
 *
 * POST /api/v1/tables/[tableId]/close - Close table (terminal state)
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-007 TableContextService transport layer
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseParams,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { tableRouteParamsSchema } from "@/services/table-context/schemas";
import { closeTable } from "@/services/table-context/table-lifecycle";

/** Route params type for Next.js 15 */
type RouteParams = { params: Promise<{ tableId: string }> };

/**
 * POST /api/v1/tables/[tableId]/close
 *
 * Close a table (terminal state).
 * Requires Idempotency-Key header.
 * Transitions: active/inactive → closed
 * Auto-ends any active dealer rotation.
 */
export async function POST(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const params = parseParams(
      await segmentData.params,
      tableRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const table = await closeTable(
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
        action: "close-table",
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
