/**
 * Lock Screen Selector Hook
 *
 * Follows existing pattern (hooks/ui/use-modal.ts).
 * Uses useShallow for render optimization.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS6
 */

'use client';

import { useShallow } from 'zustand/react/shallow';

import { useLockStore } from '@/store/lock-store';

export function useLockScreen() {
  return useLockStore(
    useShallow((s) => ({
      isLocked: s.isLocked,
      lockReason: s.lockReason,
      lockedAt: s.lockedAt,
      lock: s.lock,
      unlock: s.unlock,
    })),
  );
}
