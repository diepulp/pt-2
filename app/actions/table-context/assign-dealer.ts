/**
 * Assign Dealer Server Action
 *
 * Used by dealer assignment form in Pit Dashboard.
 * Supports useFormState for progressive enhancement.
 * For React Query mutations, use Route Handler instead.
 *
 * @see EDGE_TRANSPORT_POLICY.md section 6 (TableContextService)
 * @see SLAD section 505-513 (Entry Point Strategy)
 */
"use server";

import type { ServiceResult } from "@/lib/http/service-response";
import { withServerAction } from "@/lib/server-actions/middleware/compositor";
import { createClient } from "@/lib/supabase/server";
import { assignDealer } from "@/services/table-context/dealer-rotation";
import type { DealerRotationDTO } from "@/services/table-context/dtos";
import {
  assignDealerSchema,
  tableRouteParamsSchema,
} from "@/services/table-context/schemas";

/**
 * Assign dealer to table.
 * Auto-ends any current rotation before starting new one.
 *
 * @param tableId - Table UUID
 * @param formData - FormData with staff_id field
 * @returns ServiceResult with new dealer rotation
 */
export async function assignDealerAction(
  tableId: string,
  formData: FormData,
): Promise<ServiceResult<DealerRotationDTO>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const { tableId: validatedTableId } = tableRouteParamsSchema.parse({
        tableId,
      });
      const { staff_id } = assignDealerSchema.parse({
        staff_id: formData.get("staff_id"),
      });

      const rotation = await assignDealer(
        mwCtx.supabase,
        validatedTableId,
        mwCtx.rlsContext!.casinoId,
        staff_id,
      );

      return {
        ok: true as const,
        code: "OK" as const,
        data: rotation,
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    {
      domain: "table-context",
      action: "assign-dealer",
    },
  );
}
