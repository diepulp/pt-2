/**
 * Shift Pit Metrics Route Handler
 *
 * GET /api/v1/shift-dashboards/metrics/pits
 *
 * Returns pit-level aggregated shift metrics.
 * If pit_id is provided, returns single pit; otherwise returns all pits.
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
  getShiftAllPitsMetrics,
  getShiftPitMetrics,
  shiftPitMetricsQuerySchema,
} from "@/services/table-context/shift-metrics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const params = shiftPitMetricsQuerySchema.parse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
      pit_id: searchParams.get("pit_id") ?? undefined,
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        // If pit_id provided, get single pit; otherwise get all pits
        if (params.pit_id) {
          const metrics = await getShiftPitMetrics(mwCtx.supabase, {
            casinoId,
            startTs: params.start,
            endTs: params.end,
            pitId: params.pit_id,
          });

          return {
            ok: true as const,
            code: "OK" as const,
            data: metrics ? [metrics] : [],
            requestId: mwCtx.correlationId,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };
        }

        // Get all pits
        const metrics = await getShiftAllPitsMetrics(mwCtx.supabase, {
          casinoId,
          startTs: params.start,
          endTs: params.end,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data: metrics,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "shift-metrics.pits",
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
