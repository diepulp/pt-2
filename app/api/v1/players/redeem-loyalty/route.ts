/**
 * Local Redemption Route
 *
 * POST /api/v1/players/redeem-loyalty
 *
 * Redeems loyalty points at the caller's casino. Debits local balance atomically.
 * Balance guard prevents negative balances.
 *
 * Security: withServerAction middleware for auth/RLS/audit (ADR-024).
 * Requires Idempotency-Key header (ADR-021).
 * loyalty_ledger writes use session vars only (ADR-030 D4).
 *
 * @see PRD-051 Local Redemption
 * @see ADR-044 D6
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
import type { RedemptionResultDTO } from '@/services/recognition/dtos';
import { RedeemLoyaltyInput } from '@/services/recognition/schemas';

export async function POST(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const supabase = await createClient();
    const body = await readJsonBody(request);
    const parsed = RedeemLoyaltyInput.parse(body);

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        const service = createRecognitionService(mwCtx.supabase);
        const redemption = await service.redeemLocally(
          parsed.player_id,
          parsed.amount,
          parsed.reason,
        );
        return {
          ok: true as const,
          code: 'OK' as const,
          data: redemption as RedemptionResultDTO,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'recognition',
        action: 'redeem-loyalty',
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
