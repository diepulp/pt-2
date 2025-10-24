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

const ratingSlipCloseSchema = z.object({
  end_time: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: { ratingSlipId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking RatingSlipService.close

    const body = await readJsonBody<unknown>(request);
    const payload = ratingSlipCloseSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to RatingSlipService.close
    void params;
    void payload;

    // TODO: Invoke RatingSlipService.close and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
