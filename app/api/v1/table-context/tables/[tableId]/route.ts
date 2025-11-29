/**
 * Gaming Table Detail Route
 *
 * GET /api/v1/table-context/tables/[tableId]
 *
 * Returns table status and current dealer information.
 * Uses composable middleware for auth and RLS.
 *
 * Security: NEVER extract casino_id from request headers (V4 fix)
 */

import { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type TableStatus = Database["public"]["Enums"]["table_status"];

export type TableStatusDTO = {
  tableId: string;
  status: TableStatus;
  currentDealer: { id: string; name: string } | null;
};

// Type for staff join result from dealer_rotation query
type StaffJoinResult = {
  id: string;
  first_name: string;
  last_name: string;
};

// Type guard for staff join result
function isStaffJoinResult(value: unknown): value is StaffJoinResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "first_name" in value &&
    "last_name" in value
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const { tableId } = await params;
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const { data: table, error } = await mwCtx.supabase
          .from("gaming_table")
          .select("id, status")
          .eq("id", tableId)
          .eq("casino_id", mwCtx.rlsContext!.casinoId)
          .single();

        if (error || !table) {
          throw new Error(`Table not found: ${tableId}`);
        }

        const { data: rotation } = await mwCtx.supabase
          .from("dealer_rotation")
          .select("staff:staff_id (id, first_name, last_name)")
          .eq("table_id", tableId)
          .is("ended_at", null)
          .single();

        const staff = rotation?.staff;
        const currentDealer = isStaffJoinResult(staff)
          ? { id: staff.id, name: `${staff.first_name} ${staff.last_name}` }
          : null;

        return {
          ok: true as const,
          code: "OK" as const,
          data: { tableId: table.id, status: table.status, currentDealer },
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: "table-context",
        action: "tables.get",
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse<TableStatusDTO>(ctx, result.data!);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
