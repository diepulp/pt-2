/**
 * Session Reset Orchestrator
 *
 * Plain synchronous function — callable from hooks, event listeners,
 * and non-component contexts. NOT a React hook.
 *
 * Resets all session-scoped stores and browser storage in one atomic call.
 *
 * Invoked during:
 * - Normal sign-out (after queryClient.clear)
 * - Fallback/local-cleanup sign-out
 * - onAuthStateChange SIGNED_OUT event
 *
 * @see ADR-035 D2, INV-035-2, INV-035-6
 */

import { useLockStore } from './lock-store';
import { usePitDashboardStore } from './pit-dashboard-store';
import { usePlayerDashboardStore } from './player-dashboard-store';
import { useRatingSlipModalStore } from './rating-slip-modal-store';
import { useShiftDashboardStore } from './shift-dashboard-store';
import { useUIStore } from './ui-store';

export function resetSessionState(): void {
  // Session-scoped stores: full reset
  usePitDashboardStore.getState().resetSession();
  usePlayerDashboardStore.getState().resetSession();
  useShiftDashboardStore.getState().resetSession();
  useRatingSlipModalStore.getState().resetSession();
  useLockStore.getState().resetSession();

  // App-scoped: defensive closeModal only (sidebar persists per ADR-035)
  useUIStore.getState().closeModal();

  // Browser storage cleanup (INV-035-6)
  // PII: player names + casino-scoped IDs on shared workstations
  localStorage.removeItem('player-360-recent-players');
}
