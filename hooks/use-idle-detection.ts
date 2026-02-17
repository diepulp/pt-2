/**
 * Idle Detection Hook
 *
 * Tracks user activity (mousemove, keydown, pointerdown) and calls
 * onIdle after configurable timeout. Activity handler is throttled
 * to prevent performance churn from high-frequency events.
 *
 * visibilitychange is explicitly deferred to a future phase.
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS6
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';

interface UseIdleDetectionOptions {
  /** Timeout in ms before triggering idle (default: 300_000 = 5 min) */
  timeout?: number;
  /** Called when idle timeout is reached */
  onIdle: () => void;
  /** Enable/disable detection (MUST be false when lock screen is active) */
  enabled?: boolean;
  /** Throttle interval for activity events in ms (default: 500) */
  throttleMs?: number;
}

const DEFAULT_TIMEOUT = 300_000; // 5 minutes
const DEFAULT_THROTTLE = 500; // 500ms

export function useIdleDetection({
  timeout = DEFAULT_TIMEOUT,
  onIdle,
  enabled = true,
  throttleMs = DEFAULT_THROTTLE,
}: UseIdleDetectionOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(0);
  const onIdleRef = useRef(onIdle);

  // Keep onIdle ref current without causing effect re-runs
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      onIdleRef.current();
    }, timeout);
  }, [timeout]);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current < throttleMs) {
      return; // Throttled
    }
    lastActivityRef.current = now;
    resetTimer();
  }, [throttleMs, resetTimer]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start initial timer
    resetTimer();

    const events: Array<keyof DocumentEventMap> = [
      'mousemove',
      'keydown',
      'pointerdown',
    ];

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, resetTimer, handleActivity]);
}
