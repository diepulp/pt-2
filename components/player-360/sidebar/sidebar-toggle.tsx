/**
 * Sidebar Toggle Button (WS2 - PRD-022-PATCH-OPTION-B)
 *
 * Collapse/expand toggle for the Player 360 sidebar.
 */

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarToggleProps {
  /** Whether the sidebar is currently collapsed */
  isCollapsed: boolean;
  /** Toggle callback */
  onToggle: () => void;
  /** Additional class names */
  className?: string;
}

export function SidebarToggle({
  isCollapsed,
  onToggle,
  className,
}: SidebarToggleProps) {
  const Icon = isCollapsed ? ChevronRight : ChevronLeft;
  const label = isCollapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            "h-8 w-8 shrink-0",
            "hover:bg-accent/10 hover:text-accent",
            "transition-colors duration-200",
            className,
          )}
          data-testid="sidebar-toggle"
          aria-label={label}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={isCollapsed ? "right" : "bottom"}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
