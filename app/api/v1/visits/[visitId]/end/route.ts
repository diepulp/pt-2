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
  visitId: z.string().uuid(),
});

const visitEndSchema = z.object({
  ended_at: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: { visitId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking VisitService.end

    const body = await readJsonBody<unknown>(request);
    const payload = visitEndSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to VisitService.end
    void params;
    void payload;

    // TODO: Invoke VisitService.end and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
