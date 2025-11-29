import { NextRequest } from "next/server";

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from "@/lib/http/service-response";
import { getAuthContext } from "@/lib/supabase/rls-context";
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

    // V4 FIX: Validate casino context from authenticated user
    const authContext = await getAuthContext(supabase);

    const { data: table, error } = await supabase
      .from("gaming_table")
      .select("id, status")
      .eq("id", tableId)
      .eq("casino_id", authContext.casinoId) // Enforce casino boundary
      .single();

    if (error || !table) {
      throw new Error(`Table not found: ${tableId}`);
    }

    const { data: rotation } = await supabase
      .from("dealer_rotation")
      .select("staff:staff_id (id, first_name, last_name)")
      .eq("table_id", tableId)
      .is("ended_at", null)
      .single();

    // Use type guard instead of `as any` (V1 compliance)
    const staff = rotation?.staff;
    const currentDealer = isStaffJoinResult(staff)
      ? {
          id: staff.id,
          name: `${staff.first_name} ${staff.last_name}`,
        }
      : null;

    const result: TableStatusDTO = {
      tableId: table.id,
      status: table.status,
      currentDealer,
    };

    return successResponse<TableStatusDTO>(ctx, result);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
