/**
 * Acknowledge Alert Route Handler
 *
 * POST /api/v1/shift-intelligence/acknowledge-alert
 *
 * Acknowledges an alert with notes and false-positive flag.
 * Role gate in RPC (pit_boss/admin). Route adds defense-in-depth check.
 *
 * Error codes:
 *   SHIFT_ALERT_NOT_FOUND → 404
 *   SHIFT_ACKNOWLEDGE_UNAUTHORIZED → 403
 *
 * @see PRD-056 §4.1 Acknowledge Flow
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  RouteError,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { acknowledgeAlert } from '@/services/shift-intelligence/alerts';
import type { AcknowledgeAlertInput } from '@/services/shift-intelligence/dtos';
import { acknowledgeAlertSchema } from '@/services/shift-intelligence/schemas';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['pit_boss', 'admin']);

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const raw = await readJsonBody<Record<string, unknown>>(request);
    const input = acknowledgeAlertSchema.parse(raw) as AcknowledgeAlertInput;

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Defense-in-depth role check (RPC also enforces)
        const staffRole = mwCtx.rlsContext!.staffRole;
        if (!ALLOWED_ROLES.has(staffRole)) {
          throw new RouteError(
            'FORBIDDEN',
            'Alert acknowledgment requires pit_boss or admin role',
          );
        }

        const data = await acknowledgeAlert(mwCtx.supabase, input);

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
        domain: 'shift-intelligence',
        action: 'acknowledge-alert',
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
