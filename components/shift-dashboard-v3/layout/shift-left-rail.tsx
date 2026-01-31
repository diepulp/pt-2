'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface ShiftLeftRailProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Sticky left rail for Shift Dashboard v3.
 *
 * - Hidden below lg breakpoint
 * - w-72 at lg, w-80 at xl+
 * - position: sticky with overflow-y-auto when content exceeds viewport
 */
export function ShiftLeftRail({ children, className }: ShiftLeftRailProps) {
  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col',
        'w-72 xl:w-80 shrink-0',
        'sticky top-16 self-start',
        'max-h-[calc(100vh-4rem)] overflow-y-auto',
        'border-r border-border/40',
        'bg-card/30',
        className,
      )}
    >
      {children}
    </aside>
  );
}
