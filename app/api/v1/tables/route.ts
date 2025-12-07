/**
 * Tables List Route
 *
 * GET /api/v1/tables - List tables with filters
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-007 TableContextService transport layer
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { listTables } from "@/services/table-context/crud";
import { tableListQuerySchema } from "@/services/table-context/schemas";

/**
 * GET /api/v1/tables
 *
 * List tables with optional filters.
 * Query params: status, pit, type, cursor, limit
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();
    const query = parseQuery(request, tableListQuerySchema);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const tables = await listTables(
          mwCtx.supabase,
          mwCtx.rlsContext!.casinoId,
          {
            status: query.status,
            pit: query.pit,
            type: query.type,
            cursor: query.cursor,
            limit: query.limit,
          },
        );

        return {
          ok: true as const,
          code: "OK" as const,
          data: tables,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "list-tables",
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
