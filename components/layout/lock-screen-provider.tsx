'use client';

/**
 * Lock Screen Provider
 *
 * Client component wrapper that integrates idle detection
 * with the lock screen overlay. Rendered in dashboard layout.
 *
 * Gates on hasHydrated to prevent flash of unlocked content:
 * - Before hydration: renders nothing (layout is not yet visible anyway)
 * - After hydration + locked: renders lock overlay
 * - After hydration + unlocked: renders nothing (app content visible)
 *
 * @see LOCK-SCREEN-OPERATIONAL-PRIVACY-CONTRACT.md
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS6
 */

import { LockScreen } from '@/components/layout/lock-screen';
import { useLockScreen } from '@/hooks/ui/use-lock-screen';
import { useIdleDetection } from '@/hooks/use-idle-detection';
import { useLockStore } from '@/store/lock-store';

export function LockScreenProvider() {
  const { isLocked, lock } = useLockScreen();
  const hasHydrated = useLockStore((s) => s.hasHydrated);

  useIdleDetection({
    onIdle: () => lock('idle'),
    enabled: hasHydrated && !isLocked,
  });

  // Block rendering until sessionStorage state is rehydrated.
  // This prevents a single frame of unlocked content before
  // the persisted lock state is known.
  if (!hasHydrated) return null;

  if (!isLocked) return null;

  return <LockScreen />;
}
