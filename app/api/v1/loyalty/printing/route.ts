/**
 * Controlled loyalty-instrument print action (PRD-092 WS6)
 *
 * POST /api/v1/loyalty/printing — the ONLY sanctioned path that issues a
 * loyalty instrument to a physical printer. Both families route here (DEC-003:
 * entitlement coupon + points-comp slip).
 *
 * Security: withServerAction (auth, RLS context, audit, idempotency). Role gate
 * pit_boss|admin (defense-in-depth; the WS2 RPCs also enforce). The
 * Idempotency-Key header is the HTTP-edge single-flight for operator double-
 * clicks; the server-derived print_attempt idempotency key (DEC-005) and the
 * loopback agent jobKey dedupe (WS5) are the DB/transport backstops.
 *
 * Flow (orchestrated in services/loyalty/printing/http.ts): build canonical doc →
 * rpc_request_print_attempt(requested) → cups adapter → rpc_transition(terminal),
 * FAILS CLOSED before any success claim. Render/validation faults → failed/
 * render_validation; transport faults → failed/transport_submission (DEC-006).
 *
 * GATE-DOM-1: writes ONLY print_attempt; never promo_coupon / ledger.
 * The device address never reaches the browser (opaque printer_target_id only).
 *
 * @see PRD-092 / EXEC-092 WS6
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  readJsonBody,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import {
  controlledPrintRequestSchema,
  createInstrumentPrintingHttpFromEnv,
  type ControlledPrintResult,
} from '@/services/loyalty/printing/http';

export const dynamic = 'force-dynamic';

/** Roles permitted to drive a controlled print (mirrors the WS2 RPC gate). */
const ALLOWED_PRINT_ROLES = new Set(['pit_boss', 'admin']);

/**
 * POST /api/v1/loyalty/printing
 *
 * Requires an Idempotency-Key header. Returns the print attempt audit DTO plus
 * the terminal outcome. A non-`submitted` outcome is still a 200 (the attempt
 * was recorded truthfully) — the body carries the outcome for the operator UI.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);
    const input = controlledPrintRequestSchema.parse(body);

    const result = await withServerAction<ControlledPrintResult>(
      supabase,
      async (mwCtx) => {
        const rlsContext = mwCtx.rlsContext;
        if (!rlsContext) {
          throw new DomainError(
            'UNAUTHORIZED',
            'RLS context not available — authentication required',
          );
        }
        if (!ALLOWED_PRINT_ROLES.has(rlsContext.staffRole)) {
          throw new DomainError(
            'FORBIDDEN',
            `Role "${rlsContext.staffRole}" cannot print loyalty instruments. Requires pit_boss or admin.`,
          );
        }

        const printing = createInstrumentPrintingHttpFromEnv(
          mwCtx.supabase,
          mwCtx.correlationId,
        );
        const printResult = await printing.print(input);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: printResult,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'instrument_print_requested',
        requireIdempotency: true,
        idempotencyKey,
        correlationId: ctx.requestId,
      },
    );

    if (!result.ok) {
      return errorResponse(ctx, result);
    }

    return successResponse(ctx, result.data, 'OK', 200);
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
