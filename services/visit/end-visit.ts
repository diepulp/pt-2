/**
 * End Visit Orchestration
 *
 * Compound workflow: closes all open/paused rating slips for a visit,
 * then closes the visit itself.
 *
 * Fail-fast semantics (RULE-2): if any slip close fails, the visit
 * stays open. Already-closed slips remain closed (RPC close is terminal).
 * Retry operates only on remaining open/paused slips.
 *
 * Cross-context pattern: VisitService consumes RatingSlipService.listForVisit
 * (read) and RatingSlipService.close (RPC call) — no direct table writes
 * to rating_slip.
 *
 * @see PRD-063 Visit Lifecycle Operator Workflow
 * @see EXEC-063 WS1
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import * as ratingSlipCrud from '@/services/rating-slip/crud';
import type { Database } from '@/types/database.types';

import { closeVisit } from './crud';
import type { EndVisitResult } from './dtos';

/**
 * End a visit by closing all open/paused rating slips then closing the visit.
 *
 * Orchestration sequence:
 * 1. Fetch all slips for the visit
 * 2. Filter for open/paused slips
 * 3. Close each sequentially (fail-fast on first error)
 * 4. Close the visit if all slips succeeded
 *
 * @param supabase - Supabase client with RLS context set
 * @param visitId - Visit UUID to end
 * @returns EndVisitResult discriminated union (success or failure)
 */
export async function endVisit(
  supabase: SupabaseClient<Database>,
  visitId: string,
): Promise<EndVisitResult> {
  // 1. Fetch all slips for this visit (cross-context read via crud)
  const allSlips = await ratingSlipCrud.listForVisit(supabase, visitId);

  // 2. Filter for open/paused (closeable) slips
  const openSlips = allSlips.filter(
    (slip) => slip.status === 'open' || slip.status === 'paused',
  );

  // 3. Close each slip sequentially (fail-fast)
  let closedCount = 0;
  for (const slip of openSlips) {
    try {
      await ratingSlipCrud.close(supabase, slip.id);
      closedCount++;
    } catch (err) {
      // RULE-2: Visit stays open if any slip close fails
      return {
        ok: false,
        failedSlipId: slip.id,
        error:
          err instanceof DomainError
            ? err.message
            : String(safeErrorDetails(err) ?? 'Unknown error'),
        closedSlipCount: closedCount,
      };
    }
  }

  // 4. All slips closed — close the visit
  const visit = await closeVisit(supabase, visitId);

  return {
    ok: true,
    visit,
    closedSlipCount: closedCount,
  };
}
