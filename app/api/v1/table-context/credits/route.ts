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

const tableCreditCreateSchema = z.object({
  casino_id: z.string().uuid(),
  table_id: z.string().uuid(),
  chipset: z.record(z.string(), z.number().int().nonnegative()),
  amount_cents: z.number().int().positive(),
  authorized_by: z.string().uuid(),
  sent_by: z.string().uuid(),
  received_by: z.string().uuid(),
  slip_no: z.string().max(64).optional(),
  request_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);

    const body = await readJsonBody<unknown>(request);
    const payload = tableCreditCreateSchema.parse(body);
    const payloadWithRequestId = {
      ...payload,
      request_id: payload.request_id ?? idempotencyKey,
    };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      'rpc_request_table_credit' as never,
      payloadWithRequestId as never,
    );
    if (error) {
      throw error;
    }

    return successResponse(ctx, data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
