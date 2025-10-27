import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';

const loyaltyBalanceQuerySchema = z.object({
  player_id: z.string().uuid(),
  casino_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, loyaltyBalanceQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to LoyaltyService.getBalance
    void query;

    // TODO: Invoke LoyaltyService.getBalance and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
