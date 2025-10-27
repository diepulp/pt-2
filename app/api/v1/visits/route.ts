import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';

const visitCreateSchema = z.object({
  player_id: z.string().uuid(),
  casino_id: z.string().uuid(),
  started_at: z.string().optional(),
});

const visitListQuerySchema = z.object({
  casino_id: z.string().uuid(),
  player_id: z.string().uuid().optional(),
  status: z.enum(['open', 'closed']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking VisitService.start

    const body = await readJsonBody<unknown>(request);
    const payload = visitCreateSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to VisitService.start
    void payload;

    // TODO: Invoke VisitService.start and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, visitListQuerySchema);

    const supabase = await createClient();
    void supabase; // TODO: Pass to VisitService.list
    void query;

    // TODO: Invoke VisitService.list and return the result
    return successResponse(ctx, { items: [], next_cursor: undefined });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
