/**
 * Inventory Snapshot Route
 *
 * POST /api/v1/table-context/inventory-snapshots - Log inventory snapshot
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit, idempotency.
 * Pattern: PRD-007 TableContextService chip custody operations
 * Transport: Route Handler ONLY (hardware integration, no Server Action)
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
import { logInventorySnapshot } from "@/services/table-context/chip-custody";
import { logInventorySnapshotSchema } from "@/services/table-context/schemas";

/**
 * POST /api/v1/table-context/inventory-snapshots
 *
 * Log table inventory snapshot (open, close, rundown).
 * Requires Idempotency-Key header.
 * Used by hardware integrations and manual inventory counts.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<Record<string, unknown>>(request);

    // Validate input
    const input = logInventorySnapshotSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const snapshot = await logInventorySnapshot(mwCtx.supabase, {
          casinoId: mwCtx.rlsContext!.casinoId,
          tableId: input.table_id,
          snapshotType: input.snapshot_type,
          chipset: input.chipset,
          verifiedBy: input.verified_by,
          discrepancyCents: input.discrepancy_cents,
          note: input.note,
        });

        return {
          ok: true as const,
          code: "OK" as const,
          data: snapshot,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "log-inventory-snapshot",
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
