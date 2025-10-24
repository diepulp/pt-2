import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from "@/lib/http/service-response";
import { createClient } from "@/lib/supabase/server";

const loyaltyLedgerQuerySchema = z.object({
  casino_id: z.string().uuid(),
  player_id: z.string().uuid().optional(),
  rating_slip_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, loyaltyLedgerQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to LoyaltyService.listLedger
    void query;

    // TODO: Invoke LoyaltyService.listLedger and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
