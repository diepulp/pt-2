import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  parseParams,
  parseQuery,
  successResponse,
} from "@/lib/http/service-response";
import { createClient } from "@/lib/supabase/server";

const routeParamsSchema = z.object({
  casinoId: z.string().uuid(),
});

const staffListQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  role: z.enum(["dealer", "pit_boss", "admin"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: { casinoId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);
    const query = parseQuery(request, staffListQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to CasinoService.listStaff
    void params;
    void query;

    // TODO: Invoke CasinoService.listStaff and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
