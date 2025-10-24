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
  visitId: z.string().uuid(),
});

const ratingSlipListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: { visitId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);
    const query = parseQuery(request, ratingSlipListQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to RatingSlipService.listByVisit
    void params;
    void query;

    // TODO: Invoke RatingSlipService.listByVisit and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
