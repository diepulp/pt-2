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

const midSessionRewardSchema = z.object({
  casino_id: z.string().uuid(),
  player_id: z.string().uuid(),
  rating_slip_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  points: z.number().int().positive(),
  reason: z
    .enum([
      "mid_session",
      "session_end",
      "manual_adjustment",
      "promotion",
      "correction",
    ])
    .optional(),
  idempotency_key: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const headerIdempotencyKey = requireIdempotencyKey(request);
    const body = await readJsonBody<unknown>(request);
    const payload = midSessionRewardSchema.parse(body);
    void headerIdempotencyKey; // TODO: Use alongside payload.idempotency_key

    const supabase = await createClient();
    void supabase; // TODO: Pass to LoyaltyService.issueMidSessionReward
    void payload;

    // TODO: Invoke LoyaltyService.issueMidSessionReward and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
