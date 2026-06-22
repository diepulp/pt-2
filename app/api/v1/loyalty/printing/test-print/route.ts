/**
 * Admin test-print action (PRD-092 WS6)
 *
 * POST /api/v1/loyalty/printing/test-print — a NON-REDEEMABLE transport check.
 * It exercises the cups adapter DIRECTLY (adapter.testPrint) and:
 *   - issues NO instrument,
 *   - does NOT call rpc_request_print_attempt,
 *   - writes NO audit row (feature-loop step 8).
 *
 * Security: withServerAction (auth, RLS, audit, idempotency). Role gate
 * pit_boss|admin. The device address never reaches the browser — the response
 * carries only the bounded outcome vocabulary (submitted/failed/unknown).
 *
 * @see PRD-092 / EXEC-092 WS6
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { PrintOutcome } from '@/services/loyalty/printing/contract';
import { createInstrumentPrintingHttpFromEnv } from '@/services/loyalty/printing/http';

export const dynamic = 'force-dynamic';

/** Roles permitted to run an admin test-print (mirrors the controlled action). */
const ALLOWED_PRINT_ROLES = new Set(['pit_boss', 'admin']);

interface TestPrintResult {
  outcome: PrintOutcome;
}

/**
 * POST /api/v1/loyalty/printing/test-print
 *
 * Requires an Idempotency-Key header (mutating-shaped, even though no row is
 * written — keeps the edge contract uniform). Returns the bounded outcome.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();

    const result = await withServerAction<TestPrintResult>(
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
            `Role "${rlsContext.staffRole}" cannot run a test print. Requires pit_boss or admin.`,
          );
        }

        const printing = createInstrumentPrintingHttpFromEnv(
          mwCtx.supabase,
          mwCtx.correlationId,
        );
        const testResult = await printing.testPrint();

        return {
          ok: true as const,
          code: 'OK' as const,
          data: testResult,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'instrument_test_print',
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
