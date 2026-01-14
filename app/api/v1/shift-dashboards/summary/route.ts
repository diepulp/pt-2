/**
 * Shift Dashboard Summary Route Handler (BFF)
 *
 * GET /api/v1/shift-dashboards/summary
 *
 * Returns all three metric levels (casino, pits, tables) in a single response.
 * This BFF endpoint eliminates the need for multiple HTTP calls during
 * dashboard initialization.
 *
 * PERF: Reduces dashboard load from 7 HTTP calls to 1.
 * @see SHIFT_DASHBOARD_PERFORMANCE_AUDIT.md - Medium Severity: Redundant RPC Computation
 *
 * Security: Casino scope derived from RLS context (ADR-015)
 * @see PRD-Shift-Dashboards-v0.2
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import {
  getShiftDashboardSummary,
  shiftTableMetricsQuerySchema,
} from "@/services/table-context/shift-metrics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse and validate query params (same as table metrics)
    const { searchParams } = new URL(request.url);
    const params = shiftTableMetricsQuerySchema.parse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const summary = await getShiftDashboardSummary(mwCtx.supabase, {
          casinoId,
          startTs: params.start,
          endTs: params.end,
        });

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
        action: "shift-metrics.summary",
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
