'use client';

import { EyeIcon, ShieldCheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useShiftDashboardLayout } from '../layout/shift-dashboard-layout';

/**
 * Vertical icon strip shown when right rail is collapsed (w-12).
 * Each icon expands the rail on click.
 */
export function CollapsedIconStrip() {
  const { toggleRightRail } = useShiftDashboardLayout();

  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleRightRail}
        className="h-8 w-8 text-amber-500"
        aria-label="Expand to view telemetry"
      >
        <EyeIcon className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleRightRail}
        className="h-8 w-8"
        aria-label="Expand to view quality details"
      >
        <ShieldCheckIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}
