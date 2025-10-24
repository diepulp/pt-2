import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from "@/lib/http/service-response";
import { createClient } from "@/lib/supabase/server";

const routeParamsSchema = z.object({
  ratingSlipId: z.string().uuid(),
});

const ratingSlipUpdateSchema = z.object({
  average_bet: z.number().min(0).nullable().optional(),
  end_time: z.string().optional(),
  status: z.enum(["open", "paused", "closed"]).optional(),
  policy_snapshot: z.record(z.any()).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: { ratingSlipId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking RatingSlipService.update

    const body = await readJsonBody<unknown>(request);
    const payload = ratingSlipUpdateSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to RatingSlipService.update
    void params;
    void payload;

    // TODO: Invoke RatingSlipService.update and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
