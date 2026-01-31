'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

// === Layout Context ===

interface ShiftDashboardLayoutContextValue {
  isRightRailCollapsed: boolean;
  toggleRightRail: () => void;
}

const ShiftDashboardLayoutContext =
  React.createContext<ShiftDashboardLayoutContextValue | null>(null);

export function useShiftDashboardLayout(): ShiftDashboardLayoutContextValue {
  const context = React.useContext(ShiftDashboardLayoutContext);
  if (!context) {
    throw new Error(
      'useShiftDashboardLayout must be used within ShiftDashboardLayout',
    );
  }
  return context;
}

// === Root Layout ===

interface ShiftDashboardLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Root layout for Shift Dashboard v3.
 *
 * CRITICAL DIFFERENCE from Player 360: This layout uses native page scroll.
 * Root is NOT overflow-hidden. Rails use position: sticky.
 */
export function ShiftDashboardLayout({
  children,
  className,
}: ShiftDashboardLayoutProps) {
  const [isRightRailCollapsed, setIsRightRailCollapsed] = React.useState(false);

  const toggleRightRail = React.useCallback(() => {
    setIsRightRailCollapsed((prev) => !prev);
  }, []);

  const value = React.useMemo(
    () => ({ isRightRailCollapsed, toggleRightRail }),
    [isRightRailCollapsed, toggleRightRail],
  );

  return (
    <ShiftDashboardLayoutContext.Provider value={value}>
      <div
        className={cn(
          'flex min-h-screen w-full flex-col bg-background',
          className,
        )}
      >
        {children}
      </div>
    </ShiftDashboardLayoutContext.Provider>
  );
}
