/**
 * Operational Projection Route
 *
 * GET /api/v1/table-context/operational-projection
 *
 * Read-only projection route: shift_operational_projection has no authenticated
 * RLS policies (service_role-only). DB reads use service-role client created
 * internally by getShiftOperationalCompleteness (SERVICE_ROLE_EXEMPTION in crud.ts).
 * casinoId is derived from rlsContext — never from query params alone.
 *
 * Surface classification: BFF Summary Endpoint (ADR-041).
 * Data aggregation: service-role read of shift_operational_projection via getShiftOperationalCompleteness.
 * Authority: type is always 'estimated' (ADR-054 R4 — no layer may upgrade operational projection values).
 *
 * @see EXEC-088 DEC-EXEC-4
 */

import type { NextRequest } from 'next/server';

import {
  createRequestContext,
  errorResponse,
  parseQuery,
  successResponse,
} from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware';
import { createClient } from '@/lib/supabase/server';
import { getShiftOperationalCompleteness } from '@/services/player-financial/crud';
import type { OperationalProjectionResponseDTO } from '@/services/player-financial/dtos';
import { operationalProjectionQuerySchema } from '@/services/player-financial/schemas';

/**
 * GET /api/v1/table-context/operational-projection
 *
 * Returns grind/fill/credit projection totals and completeness status for a table+day.
 * casinoId is derived from authenticated rlsContext — request-supplied casinoId is not accepted.
 */
export async function GET(request: NextRequest) {
  const ctx = createRequestContext(request);

  try {
    const query = parseQuery(request, operationalProjectionQuerySchema);
    const { gamingDay, tableId } = query;

    const supabase = await createClient();

    const result = await withServerAction(
      supabase,
      async (mwCtx) => {
        // casinoId authoritative from rlsContext — ADR-024 / PRD-088 §5.1
        const casinoId = mwCtx.rlsContext!.casinoId;

        // null → getShiftOperationalCompleteness creates createServiceClient() internally
        // (shift_operational_projection is service_role-only; see SERVICE_ROLE_EXEMPTION in crud.ts)
        const completeness = await getShiftOperationalCompleteness(
          null,
          casinoId,
          gamingDay,
          tableId,
        );

        const dto: OperationalProjectionResponseDTO = {
          totalCents: completeness.totalCents,
          count: completeness.count,
          completeness: { status: completeness.status },
          type: 'estimated',
        };

        return {
          ok: true as const,
          code: 'OK' as const,
          data: dto,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      },
      {
        domain: 'player-financial',
        action: 'get-operational-projection',
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
