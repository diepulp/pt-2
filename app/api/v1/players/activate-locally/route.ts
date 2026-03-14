/**
 * Local Activation Route
 *
 * POST /api/v1/players/activate-locally
 *
 * Activates a player at the caller's casino. Creates player_casino + player_loyalty
 * rows. Idempotent (ON CONFLICT DO NOTHING).
 *
 * Security: withServerAction middleware for auth/RLS/audit (ADR-024).
 * Requires Idempotency-Key header (ADR-021).
 *
 * @see PRD-051 Local Activation
 * @see ADR-044 D3
 * @see EXEC-051 WS3
 */

export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createRecognitionService } from '@/services/recognition';
import type { ActivationResultDTO } from '@/services/recognition/dtos';
import { ActivateLocallyInput } from '@/services/recognition/schemas';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);
    const parsed = ActivateLocallyInput.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRecognitionService(mwCtx.supabase);
        const activation = await service.activateLocally(parsed.player_id);
        return {
          ok: true as const,
          code: 'OK' as const,
          data: activation as ActivationResultDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'recognition',
        action: 'activate-locally',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }
    return successResponse(ctx, result.data);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
