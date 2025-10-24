import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { createClient } from "@/lib/supabase/server";

const financialTxnCreateSchema = z.object({
  casino_id: z.string().uuid(),
  player_id: z.string().uuid(),
  amount: z.number(),
  tender_type: z.string().optional(),
  created_at: z.string().optional(),
  visit_id: z.string().uuid().optional(),
  rating_slip_id: z.string().uuid().optional(),
});

const financialTxnQuerySchema = z.object({
  casino_id: z.string().uuid(),
  player_id: z.string().uuid().optional(),
  gaming_day: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking PlayerFinancialService.create

    const body = await readJsonBody<unknown>(request);
    const payload = financialTxnCreateSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to PlayerFinancialService.create
    void payload;

    // TODO: Invoke PlayerFinancialService.create and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, financialTxnQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to PlayerFinancialService.list
    void query;

    // TODO: Invoke PlayerFinancialService.list and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
