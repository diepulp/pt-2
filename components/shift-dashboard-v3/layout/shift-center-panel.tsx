'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface ShiftCenterPanelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Center panel for Shift Dashboard v3.
 *
 * Natural-flow scrollable center panel (flex-1).
 * Contains charts, metrics table, alerts, and expansion slots.
 */
export function ShiftCenterPanel({
  children,
  className,
}: ShiftCenterPanelProps) {
  return (
    <main
      className={cn('flex flex-1 min-w-0 flex-col space-y-6 p-6', className)}
    >
      {children}
    </main>
  );
}
