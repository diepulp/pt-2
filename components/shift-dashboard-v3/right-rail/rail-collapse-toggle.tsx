'use client';

import { PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useShiftDashboardLayout } from '../layout/shift-dashboard-layout';

/**
 * Collapse/expand toggle for the right rail.
 */
export function RailCollapseToggle() {
  const { isRightRailCollapsed, toggleRightRail } = useShiftDashboardLayout();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleRightRail}
      className="h-8 w-8"
      aria-label={
        isRightRailCollapsed ? 'Expand right rail' : 'Collapse right rail'
      }
    >
      {isRightRailCollapsed ? (
        <PanelRightOpenIcon className="h-4 w-4" />
      ) : (
        <PanelRightCloseIcon className="h-4 w-4" />
      )}
    </Button>
  );
}
