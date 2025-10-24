import { NextRequest } from "next/server";
import { z } from "zod";

import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from "@/lib/http/service-response";
import { createClient } from "@/lib/supabase/server";

const routeParamsSchema = z.object({
  entryId: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  context: { params: { entryId: string } },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(context.params, routeParamsSchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to MtlService.getEntry
    void params;

    // TODO: Invoke MtlService.getEntry and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
