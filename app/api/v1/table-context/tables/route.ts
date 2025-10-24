import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from "@/lib/http/service-response";
import { createClient } from "@/lib/supabase/server";

const tableQuerySchema = z.object({
  casino_id: z.string().uuid(),
  status: z.enum(["inactive", "active", "closed"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, tableQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to TableContextService.list
    void query;

    // TODO: Invoke TableContextService.list and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
