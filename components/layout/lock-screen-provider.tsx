'use client';

/**
 * Lock Screen Provider
 *
 * Client component wrapper that integrates idle detection
 * with the lock screen overlay. Rendered in dashboard layout.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS6
 */

import { LockScreen } from '@/components/layout/lock-screen';
import { useLockScreen } from '@/hooks/ui/use-lock-screen';
import { useIdleDetection } from '@/hooks/use-idle-detection';

export function LockScreenProvider() {
  const { isLocked, lock } = useLockScreen();

  useIdleDetection({
    onIdle: () => lock('idle'),
    enabled: !isLocked,
  });

  if (!isLocked) return null;

  return <LockScreen />;
}
