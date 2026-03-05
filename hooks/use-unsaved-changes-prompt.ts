import { useEffect } from 'react';

/**
 * Prompts the user before leaving the page when there are unsaved changes.
 *
 * Covers refresh, tab close, and external navigation via `beforeunload`.
 *
 * Limitation (NIT-001): App Router does not support `onBeforePopState` or
 * `routeChangeStart` events. In-app back-button navigation is NOT blocked.
 * In-app link clicks within the settings area should use a guarded wrapper
 * if interception is needed (out of scope for MVP).
 */
export function useUnsavedChangesPrompt(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
