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

const tableDropEventCreateSchema = z.object({
  casino_id: z.string().uuid(),
  table_id: z.string().uuid(),
  drop_box_id: z.string().min(1),
  seal_no: z.string().min(1),
  removed_by: z.string().uuid(),
  witnessed_by: z.string().uuid(),
  removed_at: z.string().optional(),
  delivered_at: z.string().optional(),
  delivered_scan_at: z.string().optional(),
  gaming_day: z.string().optional(),
  seq_no: z.number().int().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    // Keep telemetry/audit consistent with other mutating endpoints
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey;

    const body = await readJsonBody<unknown>(request);
    const payload = tableDropEventCreateSchema.parse(body);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      'rpc_log_table_drop' as never,
      payload as never,
    );
    if (error) {
      throw error;
    }

    return successResponse(ctx, data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
