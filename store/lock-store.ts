'use client';

/**
 * Lock Screen State Store
 *
 * Persisted to sessionStorage so lock state survives hard refresh
 * within the same tab session. New tabs start unlocked.
 *
 * Only minimal state is persisted (isLocked, lockReason, lockedAt).
 * PIN values are NEVER stored — they are UX interaction tokens only.
 *
 * @see LOCK-SCREEN-OPERATIONAL-PRIVACY-CONTRACT.md
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS6
 */

import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import type { DataOnly } from './types';

export interface LockStore {
  isLocked: boolean;
  lockReason: 'manual' | 'idle' | null;
  lockedAt: number | null;
  hasHydrated: boolean;
  lock: (reason: 'manual' | 'idle') => void;
  unlock: () => void;
  setHasHydrated: (v: boolean) => void;

  // ADR-035: Full session reset (hasHydrated excluded)
  resetSession: () => void;
}

/** ADR-035 INV-035-1: Typed initial state for session reset. hasHydrated excluded — reflects persist middleware lifecycle. */
export const LOCK_INITIAL_STATE = {
  isLocked: false,
  lockReason: null,
  lockedAt: null,
} satisfies Omit<DataOnly<LockStore>, 'hasHydrated'>;

export const useLockStore = create<LockStore>()(
  devtools(
    persist(
      (set) => ({
        isLocked: false,
        lockReason: null,
        lockedAt: null,
        hasHydrated: false,
        lock: (reason) =>
          set(
            { isLocked: true, lockReason: reason, lockedAt: Date.now() },
            false,
            'lock',
          ),
        unlock: () =>
          set(
            { isLocked: false, lockReason: null, lockedAt: null },
            false,
            'unlock',
          ),
        setHasHydrated: (v) => set({ hasHydrated: v }, false, 'setHasHydrated'),

        // ADR-035: Full session reset (hasHydrated untouched)
        resetSession: () =>
          set({ ...LOCK_INITIAL_STATE }, false, 'lock/resetSession'),
      }),
      {
        name: 'pt2_lock_v1',
        storage: createJSONStorage(() => sessionStorage),
        partialize: (state) => ({
          isLocked: state.isLocked,
          lockReason: state.lockReason,
          lockedAt: state.lockedAt,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
    { name: 'lock-store' },
  ),
);
