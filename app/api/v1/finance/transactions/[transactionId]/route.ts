import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';

const routeParamsSchema = z.object({
  transactionId: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ transactionId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(await segmentData.params, routeParamsSchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to PlayerFinancialService.getById
    void params;

    // TODO: Invoke PlayerFinancialService.getById and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
