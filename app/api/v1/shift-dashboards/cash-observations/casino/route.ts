/**
 * Cash Observations Casino Rollup Route Handler
 *
 * GET /api/v1/shift-dashboards/cash-observations/casino
 *
 * Returns casino-level cash observation rollup for a time window.
 * TELEMETRY-ONLY: These are observational, NOT authoritative metrics.
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
import { getShiftCashObsCasino } from "@/services/table-context/shift-cash-obs";
import { cashObsCasinoQuerySchema } from "@/services/table-context/shift-metrics/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const params = cashObsCasinoQuerySchema.parse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
    });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        const rollup = await getShiftCashObsCasino(mwCtx.supabase, {
          casinoId,
          startTs: params.start,
          endTs: params.end,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data: rollup,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "cash-obs.casino",
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
