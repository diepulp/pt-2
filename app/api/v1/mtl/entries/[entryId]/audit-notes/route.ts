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
  entryId: z.string().uuid(),
});

const mtlAuditNoteCreateSchema = z.object({
  staff_id: z.string().uuid(),
  note: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  context: { params: { entryId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking MtlService.appendAuditNote

    const body = await readJsonBody<unknown>(request);
    const payload = mtlAuditNoteCreateSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to MtlService.appendAuditNote
    void params;
    void payload;

    // TODO: Invoke MtlService.appendAuditNote and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
