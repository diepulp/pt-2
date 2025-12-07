/**
 * End Dealer Rotation Server Action
 *
 * Used by Pit Dashboard quick-action buttons (form-based).
 * For React Query mutations, use Route Handler instead.
 *
 * @see EDGE_TRANSPORT_POLICY.md section 6 (TableContextService)
 * @see SLAD section 505-513 (Entry Point Strategy)
 */
'use server';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { endDealerRotation } from '@/services/table-context/dealer-rotation';
import type { DealerRotationDTO } from '@/services/table-context/dtos';
import { tableRouteParamsSchema } from '@/services/table-context/schemas';

/**
 * End current dealer rotation for table.
 * Returns 404 if no active rotation exists.
 *
 * @param tableId - Table UUID
 * @returns ServiceResult with ended dealer rotation
 */
export async function endDealerRotationAction(
  tableId: string,
): Promise<ServiceResult<DealerRotationDTO>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const { tableId: validatedId } = tableRouteParamsSchema.parse({
        tableId,
      });

      const rotation = await endDealerRotation(
        mwCtx.supabase,
        validatedId,
        mwCtx.rlsContext!.casinoId,
      );

      return {
        ok: true as const,
        code: 'OK' as const,
        data: rotation,
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    {
      domain: 'table-context',
      action: 'end-dealer-rotation',
    },
  );
}
