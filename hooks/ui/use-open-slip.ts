'use client';

import { toast } from 'sonner';

import { getErrorMessage, logError } from '@/lib/errors/error-utils';
import { createBrowserComponentClient } from '@/lib/supabase/client';
import { resolveCurrentSlipContext } from '@/services/rating-slip-modal/rpc';

import { useModal } from './use-modal';
import { usePitDashboardUI } from './use-pit-dashboard-ui';

/**
 * Returns an async callback that opens the rating slip modal for a given slipId.
 * Resolves the current gaming-day context via entry gate before opening.
 * Shared between PitPanelsClient (left panel) and ShiftOpsPanel (right panel).
 */
export function useOpenSlip() {
  const { setSelectedSlip } = usePitDashboardUI();
  const { open: openModal } = useModal();

  return async (slipId: string) => {
    try {
      const supabase = createBrowserComponentClient();
      const ctx = await resolveCurrentSlipContext(supabase, slipId);

      setSelectedSlip(ctx.slipIdCurrent);
      openModal('rating-slip', { slipId: ctx.slipIdCurrent });

      if (ctx.rolledOver) {
        toast.info("Session rolled over to today's gaming day.");
      }
      if (ctx.readOnly) {
        toast.info('Read-only: no player bound to this slip.');
      }
    } catch (error) {
      toast.error('Error', { description: getErrorMessage(error) });
      logError(error, { component: 'PitPanels', action: 'openSlip' });
    }
  };
}
