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
  playerId: z.string().uuid(),
});

const playerUpdateSchema = z
  .object({
    first_name: z.string().min(1).optional(),
    last_name: z.string().min(1).optional(),
    birth_date: z.string().optional(),
    casino_enrollment: z
      .object({
        casino_id: z.string().uuid(),
        status: z.enum(["active", "inactive"]).default("active"),
      })
      .optional(),
  })
  .refine(
    (payload) => Object.keys(payload).length > 0,
    "At least one field must be provided",
  );

export async function PATCH(
  request: NextRequest,
  context: { params: { playerId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking PlayerService.update

    const body = await readJsonBody<unknown>(request);
    const payload = playerUpdateSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to PlayerService.update
    void params; // TODO: Supply player ID to service
    void payload;

    // TODO: Invoke PlayerService.update and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: { playerId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to PlayerService.getById
    void params;

    // TODO: Invoke PlayerService.getById and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
