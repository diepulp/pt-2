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

const listQuerySchema = z.object({
  casino_id: z.string().uuid(),
  status: z.enum(['draft', 'review', 'approved', 'archived']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const layoutCreateSchema = z.object({
  casino_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  created_by: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, listQuerySchema);
    const supabase = await createClient();

    const limit = query.limit ?? 20;
    let dbQuery = supabase
      .from('floor_layout')
      .select('*')
      .eq('casino_id', query.casino_id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (query.status) {
      dbQuery = dbQuery.eq('status', query.status);
    }

    if (query.cursor) {
      dbQuery = dbQuery.lt('created_at', query.cursor);
    }

    const { data, error } = await dbQuery;
    if (error) {
      throw error;
    }

    const items = data ?? [];
    const nextCursor =
      items.length === limit ? items[items.length - 1]?.created_at : undefined;

    return successResponse(ctx, {
      items,
      next_cursor: nextCursor ?? undefined,
    });
  } catch (error) {
    return errorResponse(ctx, error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    requireIdempotencyKey(request);
    const body = await readJsonBody<unknown>(request);
    const payload = layoutCreateSchema.parse(body);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('rpc_create_floor_layout', {
      p_casino_id: payload.casino_id,
      p_name: payload.name,
      p_description: payload.description ?? '',
      p_created_by: payload.created_by,
    });

    if (error) {
      throw error;
    }

    return successResponse(ctx, data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
