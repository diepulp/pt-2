import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  successResponse,
} from "@/lib/http/service-response";
import { getAuthContext } from "@/lib/supabase/rls-context";
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

    // V4 FIX: Get casino_id from authenticated user context, not client input
    const authContext = await getAuthContext(supabase);
    const casinoId = authContext.casinoId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as TableStatus | null;

    const params = getTablesSchema.parse({
      status: status || undefined,
    });

    let query = supabase
      .from("gaming_table")
      .select("id, casino_id, label, pit, type, status, created_at")
      .eq("casino_id", casinoId);

    if (params.status) {
      query = query.eq("status", params.status);
    }

    const { data, error } = await query.order("label");

    if (error) throw error;

    return successResponse<GamingTableDTO[]>(ctx, data ?? []);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
