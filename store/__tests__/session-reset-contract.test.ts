/**
 * Session Reset Contract Test
 *
 * INV-035-4: Store-inventory completeness assertion.
 * This test MUST fail if:
 * - A new store hook is exported from barrel without being classified
 * - resetSessionState() misses a session store
 * - App-scoped state is incorrectly cleared
 *
 * @see ADR-035 D5, INV-035-4, INV-035-6
 */

import { act } from '@testing-library/react';

import * as storeBarrel from '../index';
import { useLockStore } from '../lock-store';
import { LOCK_INITIAL_STATE } from '../lock-store';
import {
  usePitDashboardStore,
  PIT_DASHBOARD_INITIAL_STATE,
} from '../pit-dashboard-store';
import {
  usePlayerDashboardStore,
  PLAYER_DASHBOARD_INITIAL_STATE,
} from '../player-dashboard-store';
import {
  useRatingSlipModalStore,
  RATING_SLIP_MODAL_INITIAL_STATE,
} from '../rating-slip-modal-store';
import { resetSessionState } from '../reset-session-state';
import {
  useShiftDashboardStore,
  SHIFT_DASHBOARD_INITIAL_STATE,
} from '../shift-dashboard-store';

// Classification lists — INV-035-4
const SESSION_SCOPED_HOOKS = [
  'usePitDashboardStore',
  'usePlayerDashboardStore',
  'useShiftDashboardStore',
  'useRatingSlipModalStore',
  'useLockStore',
] as const;

const APP_SCOPED_HOOKS = ['useUIStore'] as const;

/** Pick only the keys present in `initial` from `state`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only helper comparing store snapshots
function pickData(state: any, initial: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(initial).map((k) => [k, state[k]]),
  );
}

describe('Session Reset Contract (INV-035-4)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // ── Store-inventory completeness ──────────────────────────────────

  it('all barrel hook exports are classified', () => {
    const allHookExports = Object.keys(storeBarrel).filter(
      (k) =>
        k.startsWith('use') &&
        typeof (storeBarrel as Record<string, unknown>)[k] === 'function',
    );
    const classified = [...SESSION_SCOPED_HOOKS, ...APP_SCOPED_HOOKS];
    expect(allHookExports.sort()).toEqual([...classified].sort());
  });

  // ── Session stores return to INITIAL_STATE ────────────────────────

  it('all session stores return to INITIAL_STATE after resetSessionState()', () => {
    // Mutate every session store to non-default values
    act(() => {
      usePitDashboardStore.setState({
        selectedTableId: 'table-999',
        selectedSlipId: 'slip-999',
        selectedPitLabel: 'Pit Z',
        activePanel: 'analytics',
        newSlipSeatNumber: '7',
        activitySearchQuery: 'search term',
        activitySortMode: 'alpha-asc',
      });

      usePlayerDashboardStore.setState({
        selectedPlayerId: 'player-999',
      });

      useShiftDashboardStore.setState({
        timeWindow: { start: '2026-01-01T00:00:00Z', end: '2026-01-01T08:00:00Z' },
        timeWindowPreset: '24h',
        lens: 'table',
        selectedPitId: 'pit-999',
        selectedTableId: 'table-999',
      });

      useRatingSlipModalStore.setState({
        slipId: 'slip-999',
        formState: {
          averageBet: '500',
          startTime: '2026-01-01T10:00',
          newBuyIn: '1000',
          newTableId: 'table-888',
          newSeatNumber: '3',
          chipsTaken: '250',
        },
        originalState: {
          averageBet: '500',
          startTime: '2026-01-01T10:00',
          newBuyIn: '1000',
          newTableId: 'table-888',
          newSeatNumber: '3',
          chipsTaken: '250',
        },
      });

      useLockStore.setState({
        isLocked: true,
        lockReason: 'manual',
        lockedAt: 1700000000000,
        hasHydrated: true,
      });
    });

    // Reset
    act(() => {
      resetSessionState();
    });

    // Assert each store matches INITIAL_STATE
    expect(pickData(usePitDashboardStore.getState(), PIT_DASHBOARD_INITIAL_STATE))
      .toEqual(PIT_DASHBOARD_INITIAL_STATE);

    expect(pickData(usePlayerDashboardStore.getState(), PLAYER_DASHBOARD_INITIAL_STATE))
      .toEqual(PLAYER_DASHBOARD_INITIAL_STATE);

    expect(pickData(useShiftDashboardStore.getState(), SHIFT_DASHBOARD_INITIAL_STATE))
      .toEqual(SHIFT_DASHBOARD_INITIAL_STATE);

    expect(pickData(useRatingSlipModalStore.getState(), RATING_SLIP_MODAL_INITIAL_STATE))
      .toEqual(RATING_SLIP_MODAL_INITIAL_STATE);

    expect(pickData(useLockStore.getState(), LOCK_INITIAL_STATE))
      .toEqual(LOCK_INITIAL_STATE);
  });

  // ── Lock store hasHydrated preserved ──────────────────────────────

  it('lock store hasHydrated is NOT reset', () => {
    act(() => {
      useLockStore.setState({ hasHydrated: true, isLocked: true, lockReason: 'manual' });
    });

    act(() => {
      resetSessionState();
    });

    expect(useLockStore.getState().hasHydrated).toBe(true);
    expect(useLockStore.getState().isLocked).toBe(false);
  });

  // ── App-scoped state preserved ────────────────────────────────────

  it('app-scoped sidebar preference preserved', () => {
    const { useUIStore } = storeBarrel;

    act(() => {
      useUIStore.getState().toggleSidebar();
    });
    const before = useUIStore.getState().sidebarCollapsed;

    act(() => {
      resetSessionState();
    });

    expect(useUIStore.getState().sidebarCollapsed).toBe(before);
  });

  it('app-scoped modal closed defensively', () => {
    const { useUIStore } = storeBarrel;

    act(() => {
      useUIStore.getState().openModal('rating-slip', { some: 'data' });
    });
    expect(useUIStore.getState().modal.isOpen).toBe(true);

    act(() => {
      resetSessionState();
    });

    expect(useUIStore.getState().modal.isOpen).toBe(false);
  });

  // ── Idempotency ───────────────────────────────────────────────────

  it('idempotent — calling twice produces same result', () => {
    act(() => {
      usePitDashboardStore.setState({ selectedTableId: 'table-999' });
    });

    act(() => {
      resetSessionState();
    });
    const snapshot1 = pickData(usePitDashboardStore.getState(), PIT_DASHBOARD_INITIAL_STATE);

    act(() => {
      resetSessionState();
    });
    const snapshot2 = pickData(usePitDashboardStore.getState(), PIT_DASHBOARD_INITIAL_STATE);

    expect(snapshot1).toEqual(snapshot2);
  });

  // ── localStorage cleanup (INV-035-6) ──────────────────────────────

  it('localStorage player-360-recent-players cleared', () => {
    localStorage.setItem(
      'player-360-recent-players',
      JSON.stringify([{ id: '1', name: 'Test Player' }]),
    );

    act(() => {
      resetSessionState();
    });

    expect(localStorage.getItem('player-360-recent-players')).toBeNull();
  });
});
