'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

import { useShiftDashboardLayout } from './shift-dashboard-layout';

interface ShiftRightRailProps {
  children: React.ReactNode;
  /** Content to show when rail is collapsed (icon strip) */
  collapsedContent?: React.ReactNode;
  className?: string;
}

/**
 * Sticky, collapsible right rail for Shift Dashboard v3.
 *
 * - Hidden below xl breakpoint
 * - w-80 expanded, w-12 collapsed
 * - position: sticky with overflow-y-auto when expanded
 * - Smooth CSS transition on collapse/expand
 */
export function ShiftRightRail({
  children,
  collapsedContent,
  className,
}: ShiftRightRailProps) {
  const { isRightRailCollapsed } = useShiftDashboardLayout();

  return (
    <aside
      className={cn(
        'hidden xl:flex flex-col',
        'shrink-0',
        'sticky top-16 self-start',
        'max-h-[calc(100vh-4rem)] overflow-y-auto',
        'border-l border-border/40',
        'bg-card/30',
        'transition-all duration-200 ease-in-out',
        isRightRailCollapsed ? 'w-12' : 'w-80',
        className,
      )}
    >
      {isRightRailCollapsed ? collapsedContent : children}
    </aside>
  );
}
