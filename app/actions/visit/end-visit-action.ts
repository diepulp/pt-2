/**
 * End Visit Server Action
 *
 * Compound workflow: closes all open/paused slips then closes the visit.
 * Uses withServerAction middleware for auth, RLS, tracing, and audit.
 *
 * @see PRD-063 Visit Lifecycle Operator Workflow
 * @see EXEC-063 WS1
 */
'use server';

import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import type { EndVisitResult } from '@/services/visit/dtos';
import { endVisit } from '@/services/visit/end-visit';

/**
 * End a visit by closing all open/paused rating slips then closing the visit.
 *
 * @param visitId - Visit UUID to end
 * @returns ServiceResult wrapping EndVisitResult
 */
export async function endVisitAction(
  visitId: string,
): Promise<ServiceResult<EndVisitResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const result = await endVisit(mwCtx.supabase, visitId);

      return {
        ok: true as const,
        code: 'OK' as const,
        data: result,
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    {
      domain: 'visit',
      action: 'end-visit',
    },
  );
}
