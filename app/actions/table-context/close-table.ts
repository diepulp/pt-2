/**
 * Close Table Server Action
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
import type { GamingTableDTO } from '@/services/table-context/dtos';
import { tableRouteParamsSchema } from '@/services/table-context/schemas';
import { closeTable } from '@/services/table-context/table-lifecycle';

/**
 * Close table (active/inactive → closed terminal state).
 * Auto-ends any active dealer rotation.
 *
 * @param tableId - Table UUID
 * @returns ServiceResult with closed table
 */
export async function closeTableAction(
  tableId: string,
): Promise<ServiceResult<GamingTableDTO>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const { tableId: validatedId } = tableRouteParamsSchema.parse({
        tableId,
      });

      const table = await closeTable(
        mwCtx.supabase,
        validatedId,
        mwCtx.rlsContext!.casinoId,
      );

      return {
        ok: true as const,
        code: 'OK' as const,
        data: table,
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    {
      domain: 'table-context',
      action: 'close-table',
    },
  );
}
