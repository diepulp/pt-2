import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { createClient } from "@/lib/supabase/server";

const ratingSlipCreateSchema = z.object({
  player_id: z.string().uuid(),
  casino_id: z.string().uuid(),
  visit_id: z.string().uuid().optional(),
  table_id: z.string().uuid().optional(),
  game_settings: z.record(z.any()).nullable().optional(),
  average_bet: z.number().min(0).nullable().optional(),
  policy_snapshot: z.record(z.any()).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking RatingSlipService.create

    const body = await readJsonBody<unknown>(request);
    const payload = ratingSlipCreateSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to RatingSlipService.create
    void payload;

    // TODO: Invoke RatingSlipService.create and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
