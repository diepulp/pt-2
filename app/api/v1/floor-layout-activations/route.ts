/**
 * Floor Layout Activation Route
 *
 * POST /api/v1/floor-layout-activations - Activate a floor layout version
 *
 * Security: Uses withServerAction middleware for auth, RLS, audit.
 * Pattern: PRD-004 Floor Layout Service
 */

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
import { activateFloorLayoutSchema } from '@/services/floor-layout/schemas';

/**
 * POST /api/v1/floor-layout-activations
 *
 * Activate a floor layout version for a casino.
 * Requires Idempotency-Key header.
 * Uses rpc_activate_floor_layout RPC for transactional activation.
 *
 * Returns 201 on success.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);
    const payload = activateFloorLayoutSchema.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Call RPC with validated payload
        const { data, error } = await mwCtx.supabase.rpc(
          'rpc_activate_floor_layout',
          {
            p_casino_id: payload.casino_id,
            p_layout_version_id: payload.layout_version_id,
            p_activated_by: payload.activated_by,
            p_request_id: payload.activation_request_id ?? idempotencyKey,
          },
        );

        if (error) {
          throw error;
        }

        return {
          ok: true as const,
          code: 'OK' as const,
          data,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'floor-layout',
        action: 'activate',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    // Return 201 Created for new activation
    return successResponse(ctx, result.data, 'OK', 201);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
