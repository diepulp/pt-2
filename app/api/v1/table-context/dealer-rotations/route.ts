import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';

const dealerRotationCreateSchema = z.object({
  casino_id: z.string().uuid(),
  table_id: z.string().uuid(),
  staff_id: z.string().uuid().optional(),
  started_at: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking TableContextService.startRotation

    const body = await readJsonBody<unknown>(request);
    const payload = dealerRotationCreateSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to TableContextService.startRotation
    void payload;

    // TODO: Invoke TableContextService.startRotation and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
