/**
 * Cash Observations Summary BFF Route Handler
 *
 * GET /api/v1/shift-dashboards/cash-observations/summary
 *
 * Returns consolidated cash observation data (casino, pits, tables, alerts)
 * in a single response. PERF: Reduces 4 HTTP calls to 1.
 *
 * TELEMETRY-ONLY: All data is observational, NOT authoritative metrics.
 *
 * Security: Casino scope derived from RLS context (ADR-015)
 * @see SHIFT_DASHBOARD_HTTP_CASCADE.md (PERF-001)
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
import { getShiftCashObsSummary } from "@/services/table-context/shift-cash-obs";
import { cashObsSummaryQuerySchema } from "@/services/table-context/shift-metrics/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const params = cashObsSummaryQuerySchema.parse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        // PERF: Single service call executes 4 RPCs in parallel
        const summary = await getShiftCashObsSummary(mwCtx.supabase, {
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
        action: "cash-obs.summary",
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
