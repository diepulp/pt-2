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

const tableInventorySnapshotCreateSchema = z.object({
  casino_id: z.string().uuid(),
  table_id: z.string().uuid(),
  snapshot_type: z.enum(['open', 'close', 'rundown']),
  chipset: z.record(z.string(), z.number().int().nonnegative()),
  counted_by: z.string().uuid().optional(),
  verified_by: z.string().uuid().optional(),
  discrepancy_cents: z.number().int().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // Placeholder until rpc_log_table_inventory_snapshot accepts request identifiers

    const body = await readJsonBody<unknown>(request);
    const payload = tableInventorySnapshotCreateSchema.parse(body);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      'rpc_log_table_inventory_snapshot' as never,
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
