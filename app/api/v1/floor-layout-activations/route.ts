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

const activationSchema = z.object({
  casino_id: z.string().uuid(),
  layout_version_id: z.string().uuid(),
  activated_by: z.string().uuid(),
  activation_request_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const body = await readJsonBody<unknown>(request);
    const payload = activationSchema.parse(body);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('rpc_activate_floor_layout', {
      p_casino_id: payload.casino_id,
      p_layout_version_id: payload.layout_version_id,
      p_activated_by: payload.activated_by,
      p_request_id: payload.activation_request_id ?? idempotencyKey,
    });

    if (error) {
      throw error;
    }

    return successResponse(ctx, data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
