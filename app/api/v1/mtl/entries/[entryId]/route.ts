/**
 * MTL Entry Detail Route
 *
 * GET /api/v1/mtl/entries/[entryId] - Get entry with audit notes
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Authorization per ADR-025:
 * - Entry READ: pit_boss, cashier, admin
 *
 * @see PRD-005 MTL Service
 * @see ADR-025 MTL Authorization Model
 */

import type { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { assertRole } from "@/lib/supabase/rls-context";
import { createClient } from "@/lib/supabase/server";
import { createMtlService } from "@/services/mtl";
import { mtlEntryRouteParamsSchema } from "@/services/mtl/schemas";

/**
 * GET /api/v1/mtl/entries/[entryId]
 *
 * Get MTL entry by ID with audit notes.
 */
export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ entryId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(
      await segmentData.params,
      mtlEntryRouteParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // ADR-025: Entry READ allowed for pit_boss, cashier, admin
        assertRole(mwCtx.rlsContext!, ["pit_boss", "cashier", "admin"]);

        const service = createMtlService(mwCtx.supabase);
        const entry = await service.getEntryById(params.entryId);

        return {
          ok: true as const,
          code: "OK" as const,
          data: entry,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "mtl",
        action: "get-entry",
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
