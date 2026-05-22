/**
 * Floor Layout Pit Assignment State Route
 *
 * GET /api/v1/floor-layouts/pit-assignment-state — Aggregate state for the
 * admin pit-configuration panel. Casino is derived from RLS context (never
 * from query/headers, ADR-024 INV-8). Admin role required.
 *
 * Pattern: PRD-067 Admin Operations Pit Configuration (EXEC-067 §WS3).
 * Precedent: app/api/v1/casino/settings/route.ts.
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { createFloorLayoutService } from '@/services/floor-layout';
import type { PitAssignmentStateDTO } from '@/services/floor-layout/dtos';

/**
 * GET /api/v1/floor-layouts/pit-assignment-state
 *
 * Returns the aggregate pit-assignment state (pits + slots + unassigned
 * tables) for the casino's currently-active floor layout version. Returns
 * `null` data when the casino has no active layout.
 *
 * Read-only — no idempotency key required.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Defence-in-depth: admin gate. RLS still enforces tenant scope.
        if (mwCtx.rlsContext!.staffRole !== 'admin') {
          throw new DomainError(
            'FORBIDDEN_ADMIN_REQUIRED',
            'Admin role required for pit assignment state',
          );
        }

        const casinoId = mwCtx.rlsContext!.casinoId;
        const service = createFloorLayoutService(mwCtx.supabase);
        const data = await service.getPitAssignmentState(casinoId);

        return {
          ok: true as const,
          code: 'OK' as const,
          data: data as PitAssignmentStateDTO | null,
          requestId: mwCtx.correlationId,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'floor-layout',
        action: 'pit_assignment_state.get',
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
