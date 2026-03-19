/**
 * Mid-Session Reward Route — NOT IMPLEMENTED
 *
 * POST /api/v1/loyalty/mid-session-reward
 *
 * Returns 501 Not Implemented per PRD §7.4 (D6 scope change: GAP-B5 divergence).
 * Mid-session auto-trigger is out of scope for the loyalty operator issuance pilot.
 * The unified issuance endpoint POST /api/v1/loyalty/issue replaces this pathway.
 *
 * @see PRD-052 §7.4
 * @see EXEC-052 WS3
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  requireIdempotencyKey,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/loyalty/mid-session-reward
 *
 * 501 Not Implemented — PRD §7.4 scope exclusion.
 */
export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();

    await withServerAction(
      supabase,
      async () => {
        // PRD-052 §7.4: Mid-session-reward is 501 Not Implemented.
        // GAP-B5 divergence makes wiring dishonest; auto-trigger out of scope.
        return {
          ok: true as const,
          code: 'OK' as const,
          data: null,
          requestId: ctx.requestId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'loyalty',
        action: 'mid-session-reward-501',
        correlationId: ctx.requestId,
        requireIdempotency: true,
        idempotencyKey,
      },
    );

    return NextResponse.json(
      {
        ok: false,
        code: 'LOYALTY_NOT_IMPLEMENTED',
        status: 501,
        error:
          'Mid-session reward endpoint is not implemented. Use POST /api/v1/loyalty/issue instead. See PRD §7.4.',
        requestId: ctx.requestId,
        durationMs: Date.now() - ctx.startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 501 },
    );
  } catch (error) {
    return errorResponse(ctx, error);
  }
}
