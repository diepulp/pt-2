/**
 * Table Status Update Route
 *
 * POST /api/v1/table-context/status
 *
 * Updates gaming table status via state machine validation.
 * Uses composable middleware for auth, RLS, idempotency, and audit.
 *
 * Security: NEVER extract casino_id from request headers (V4 fix)
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
import { updateTableStatus } from "@/services/table-context";
import type { Database } from "@/types/database.types";

interface UpdateTableStatusRequest {
  tableId: string;
  status: Database["public"]["Enums"]["table_status"];
}

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody<UpdateTableStatusRequest>(request);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const table = await updateTableStatus(
          mwCtx.supabase,
          body.tableId,
          body.status,
        );
        return {
          ok: true as const,
          code: "OK" as const,
          data: table,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "status.update",
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
