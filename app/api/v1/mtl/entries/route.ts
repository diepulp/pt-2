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

const mtlEntryCreateSchema = z.object({
  casino_id: z.string().uuid(),
  patron_uuid: z.string().uuid(),
  staff_id: z.string().uuid().optional(),
  rating_slip_id: z.string().uuid().optional(),
  visit_id: z.string().uuid().optional(),
  amount: z.number(),
  direction: z.enum(["in", "out"]),
  area: z.string().optional(),
  idempotency_key: z.string().optional(),
  created_at: z.string().optional(),
});

const mtlEntriesQuerySchema = z.object({
  casino_id: z.string().uuid(),
  patron_uuid: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  min_amount: z.coerce.number().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const headerIdempotencyKey = requireIdempotencyKey(request);
    const body = await readJsonBody<unknown>(request);
    const payload = mtlEntryCreateSchema.parse(body);
    void headerIdempotencyKey; // TODO: Use alongside payload.idempotency_key

    const supabase = await createClient();
    void supabase; // TODO: Pass to MtlService.createEntry
    void payload;

    // TODO: Invoke MtlService.createEntry and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, mtlEntriesQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to MtlService.listEntries
    void query;

    // TODO: Invoke MtlService.listEntries and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
