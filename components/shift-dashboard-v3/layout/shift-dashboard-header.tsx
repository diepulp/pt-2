'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface ShiftDashboardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Sticky header for Shift Dashboard v3.
 * position: sticky, top: 0, z-30.
 */
export function ShiftDashboardHeader({
  children,
  className,
}: ShiftDashboardHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 shrink-0',
        'border-b border-border/40 bg-background/95 backdrop-blur-sm',
        'supports-[backdrop-filter]:bg-background/60',
        className,
      )}
    >
      {children}
    </header>
  );
}
