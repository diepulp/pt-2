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

const playerCreateSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  birth_date: z.string().optional(),
  casino_enrollment: z
    .object({
      casino_id: z.string().uuid(),
      status: z.enum(["active", "inactive"]).default("active"),
    })
    .optional(),
});

const playerListQuerySchema = z.object({
  casino_id: z.string().uuid(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking PlayerService.create

    const body = await readJsonBody<unknown>(request);
    const payload = playerCreateSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to PlayerService

    // TODO: Invoke PlayerService.create and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, playerListQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to PlayerService.list
    void query; // TODO: Supply to PlayerService.list

    // TODO: Invoke PlayerService.list and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
