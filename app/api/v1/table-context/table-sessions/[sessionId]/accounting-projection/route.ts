/**
 * GET /api/v1/table-context/table-sessions/[sessionId]/accounting-projection
 *
 * Returns the canonical TableInventoryAccounting read-time projection.
 *
 * - Simple Query pattern (ADR-041 DEC-4): single entity, single bounded context
 * - Role guard: pit_boss / admin only; dealer/cashier → 403, no service invocation
 * - Cross-casino sessionId → 404 (SESSION_NOT_FOUND, not integrity_failure — avoids info leak)
 * - calculation_kind='integrity_failure' is HTTP 200 (valid business state, not an error)
 * - bigint fields serialized as strings at HTTP boundary (lossless; JSON has no native bigint)
 *
 * @see PRD-090, EXEC-090 WS3, ADR-059, ADR-041 DEC-4, SRL-TIA-001
 */

import type { NextRequest } from 'next/server';

import { DomainError } from '@/lib/errors/domain-errors';
import {
  createRequestContext,
  errorResponse,
  parseParams,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import type { TableInventoryAccountingProjection } from '@/services/table-context/dtos';
import { accountingProjectionParamsSchema } from '@/services/table-context/schemas';
import { createTableInventoryAccountingService } from '@/services/table-context/table-inventory-accounting';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['pit_boss', 'admin']);

// Serialized response type — bigint fields encoded as string for JSON transport.
// bigint was chosen deliberately over number to avoid overflow for high-value chipset
// totals (see WS2 tia.snapshot_resolution test: value >= 2,147,483,648 cents).
// String encoding is lossless across the full bigint range.
type AccountingProjectionApiResponse = Omit<
  TableInventoryAccountingProjection,
  | 'projected_table_win_loss_cents'
  | 'partial_table_result_cents'
  | 'telemetry_derived_drop_estimate_cents'
> & {
  projected_table_win_loss_cents: string | null;
  partial_table_result_cents: string | null;
  telemetry_derived_drop_estimate_cents: string | null;
};

function serializeProjection(
  p: TableInventoryAccountingProjection,
): AccountingProjectionApiResponse {
  return {
    ...p,
    projected_table_win_loss_cents:
      p.projected_table_win_loss_cents != null
        ? String(p.projected_table_win_loss_cents)
        : null,
    partial_table_result_cents:
      p.partial_table_result_cents != null
        ? String(p.partial_table_result_cents)
        : null,
    telemetry_derived_drop_estimate_cents:
      p.telemetry_derived_drop_estimate_cents != null
        ? String(p.telemetry_derived_drop_estimate_cents)
        : null,
  };
}

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, segmentData: RouteParams) {
  const ctx = createRequestContext(request);

  try {
    const { sessionId } = parseParams(
      await segmentData.params,
      accountingProjectionParamsSchema,
    );
    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // Role guard — before service invocation (EXEC-090 WS3 requirement)
        if (!ALLOWED_ROLES.has(mwCtx.rlsContext!.staffRole)) {
          throw new DomainError(
            'FORBIDDEN',
            'Operation requires pit_boss or admin role',
          );
        }

        const casinoId = mwCtx.rlsContext!.casinoId;
        const service = createTableInventoryAccountingService(mwCtx.supabase);

        // casinoId from rlsContext only — never from request params (ADR-024)
        const projection = await service.derive({
          tableSessionId: sessionId,
          casinoId,
          requestId: mwCtx.correlationId,
        });

        return {
          ok: true as const,
          code: 'OK' as const,
          data: serializeProjection(projection),
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'table-context',
        action: 'get-accounting-projection',
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
