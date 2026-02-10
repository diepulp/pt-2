'use client';

/**
 * Lock Screen State Store
 *
 * Pure state — no side effects, no telemetry emission.
 * Lock/unlock telemetry is emitted from the component layer
 * where the auth hook provides identity context.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS6
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface LockStore {
  isLocked: boolean;
  lockReason: 'manual' | 'idle' | null;
  lockedAt: number | null;
  lock: (reason: 'manual' | 'idle') => void;
  unlock: () => void;
}

export const useLockStore = create<LockStore>()(
  devtools(
    (set) => ({
      isLocked: false,
      lockReason: null,
      lockedAt: null,
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
    }),
    { name: 'lock-store' },
  ),
);
