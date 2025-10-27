import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createRequestContext,
  errorResponse,
  parseParams,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { createClient } from '@/lib/supabase/server';

const routeParamsSchema = z.object({
  casinoId: z.string().uuid(),
});

const casinoSettingsPatchSchema = z.object({
  timezone: z.string().optional(),
  gaming_day_start_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  watchlist_floor: z.number().min(0).optional(),
  ctr_threshold: z.number().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  segmentData: { params: Promise<{ casinoId: string }> },
) {
  const ctx = createRequestContext(request);

  try {
    const params = parseParams(await segmentData.params, routeParamsSchema);
    const idempotencyKey = requireIdempotencyKey(request);
    void idempotencyKey; // TODO: Use when invoking CasinoService.updateSettings

    const body = await readJsonBody<unknown>(request);
    const payload = casinoSettingsPatchSchema.parse(body);

    const supabase = await createClient();
    void supabase; // TODO: Pass to CasinoService.updateSettings
    void params;
    void payload;

    // TODO: Invoke CasinoService.updateSettings and return the result
    return successResponse(ctx, null);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
