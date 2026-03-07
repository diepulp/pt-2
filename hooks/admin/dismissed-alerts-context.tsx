'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface DismissedAlertsContextValue {
  dismissedKeys: Set<string>;
  dismissAlert: (key: string) => void;
  isDismissed: (key: string) => boolean;
}

const DismissedAlertsContext =
  createContext<DismissedAlertsContextValue | null>(null);

export function DismissedAlertsProvider({ children }: { children: ReactNode }) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const dismissAlert = useCallback((key: string) => {
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const isDismissed = useCallback(
    (key: string) => dismissedKeys.has(key),
    [dismissedKeys],
  );

  const value = useMemo(
    () => ({ dismissedKeys, dismissAlert, isDismissed }),
    [dismissedKeys, dismissAlert, isDismissed],
  );

  return (
    <DismissedAlertsContext.Provider value={value}>
      {children}
    </DismissedAlertsContext.Provider>
  );
}

export function useDismissedAlerts(): DismissedAlertsContextValue {
  const context = useContext(DismissedAlertsContext);
  if (!context) {
    throw new Error(
      'useDismissedAlerts must be used within a DismissedAlertsProvider',
    );
  }
  return context;
}

const NOOP_DISMISSED: DismissedAlertsContextValue = {
  dismissedKeys: new Set<string>(),
  dismissAlert: () => {},
  isDismissed: () => false,
};

/**
 * Safe variant for components that may render before the provider mounts
 * (e.g., sidebar badge during server-side redirects).
 */
export function useDismissedAlertsSafe(): DismissedAlertsContextValue {
  const context = useContext(DismissedAlertsContext);
  return context ?? NOOP_DISMISSED;
}
