/**
 * Gaming Tables List Route
 *
 * GET /api/v1/table-context/tables
 *
 * Lists gaming tables for the authenticated casino.
 * Uses composable middleware for auth and RLS.
 *
 * Security: NEVER extract casino_id from request headers (V4 fix)
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type TableStatus = Database["public"]["Enums"]["table_status"];
type GamingTableRow = Database["public"]["Tables"]["gaming_table"]["Row"];

export type GamingTableDTO = Pick<
  GamingTableRow,
  "id" | "casino_id" | "label" | "pit" | "type" | "status" | "created_at"
>;

const getTablesSchema = z.object({
  status: z.enum(["inactive", "active", "closed"]).optional(),
});

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as TableStatus | null;
    const params = getTablesSchema.parse({ status: status || undefined });

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const casinoId = mwCtx.rlsContext!.casinoId;

        let query = mwCtx.supabase
          .from("gaming_table")
          .select("id, casino_id, label, pit, type, status, created_at")
          .eq("casino_id", casinoId);

        if (params.status) {
          query = query.eq("status", params.status);
        }

        const { data, error } = await query.order("label");

        if (error) throw error;

        return {
          ok: true as const,
          code: "OK" as const,
          data: (data ?? []) as GamingTableDTO[],
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "tables.list",
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse<GamingTableDTO[]>(ctx, result.data!);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
