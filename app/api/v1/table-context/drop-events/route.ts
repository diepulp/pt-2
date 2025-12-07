/**
 * Table Drop Event Route
 *
 * POST /api/v1/table-context/drop-events - Log drop box event
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-007 TableContextService chip custody operations
 * Transport: Route Handler ONLY (hardware integration, custody chain)
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import { logDropEvent } from "@/services/table-context/chip-custody";
import { logDropEventSchema } from "@/services/table-context/schemas";

/**
 * POST /api/v1/table-context/drop-events
 *
 * Log drop box removal/delivery event.
 * Requires Idempotency-Key header.
 * Used by drop box custody chain tracking and hardware integrations.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<Record<string, unknown>>(request);

    // Validate input
    const input = logDropEventSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const dropEvent = await logDropEvent(mwCtx.supabase, {
          casinoId: mwCtx.rlsContext!.casinoId,
          tableId: input.table_id,
          dropBoxId: input.drop_box_id,
          sealNo: input.seal_no,
          removedBy: input.removed_by,
          witnessedBy: input.witnessed_by,
          removedAt: input.removed_at,
          deliveredAt: input.delivered_at,
          deliveredScanAt: input.delivered_scan_at,
          gamingDay: input.gaming_day,
          seqNo: input.seq_no,
          note: input.note,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data: dropEvent,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "log-drop-event",
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data, "OK", 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
