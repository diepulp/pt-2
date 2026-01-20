/**
 * Active Visitors Summary Route Handler
 *
 * GET /api/v1/shift-dashboards/visitors-summary
 *
 * Returns aggregated counts of active visitors by visit_kind (rated vs unrated).
 * Used by Floor Activity Donut in Shift Dashboard V2.
 *
 * Security: Casino scope derived from RLS context (ADR-024)
 * @see IMPLEMENTATION_STRATEGY.md §5.2 Active Visitors Donut
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import type { ActiveVisitorsSummaryDTO } from "@/services/table-context/dtos";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Call the RPC function (no params needed - uses RLS context)
        // Note: Cast to any because RPC is not yet in generated types
        // Run `npm run db:types` after migration to fix
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (mwCtx.supabase.rpc as any)(
          "rpc_shift_active_visitors_summary",
        );

        if (error) {
          throw new Error(`Database error: ${error.message}`);
        }

        // RPC returns a single row, extract it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = Array.isArray(data) ? data[0] : (data as any);

        // Handle null/empty response
        if (!row) {
          const emptyResult: ActiveVisitorsSummaryDTO = {
            rated_count: 0,
            unrated_count: 0,
            total_count: 0,
            rated_percentage: 0,
          };

          return {
            ok: true as const,
            code: "OK" as const,
            data: emptyResult,
            requestId: mwCtx.correlationId,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };
        }

        const summary: ActiveVisitorsSummaryDTO = {
          rated_count: Number(row.rated_count) || 0,
          unrated_count: Number(row.unrated_count) || 0,
          total_count: Number(row.total_count) || 0,
          rated_percentage: Number(row.rated_percentage) || 0,
        };

        return {
          ok: true as const,
          code: "OK" as const,
          data: summary,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "shift-metrics.visitors-summary",
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
